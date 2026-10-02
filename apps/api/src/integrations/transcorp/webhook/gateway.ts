import { createHash, timingSafeEqual } from "node:crypto";
import type { TranscorpConfig } from "../config.js";
import { redis } from "../../../infrastructure/redis/client.js";

/**
 * Webhook foundation. Provider-specific business processing is NOT
 * implemented; this only provides the trust boundary:
 *
 *   authenticate → validate shape → replay/idempotency claim → dispatch to a
 *   registered handler (none exist yet) → safe acknowledgement.
 *
 * Nothing about the payload is persisted. The exact production webhook
 * authentication and retry contract is unconfirmed, so the verifier is an
 * interface: today a shared header token (header NAME is configuration, the
 * token is an env secret); an HMAC verifier can be added without touching the
 * gateway.
 */

export interface WebhookVerifier {
  /** Must be constant-time with respect to secret material. */
  verify(headers: Record<string, string | string[] | undefined>): boolean;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export class SharedHeaderTokenVerifier implements WebhookVerifier {
  constructor(
    private readonly headerName: string,
    private readonly expectedToken: string,
  ) {}

  verify(headers: Record<string, string | string[] | undefined>): boolean {
    const presented = headers[this.headerName.toLowerCase()];
    if (typeof presented !== "string" || presented.length === 0) return false;
    // Hash both sides so the comparison is fixed-length (no length leak) and constant-time.
    return timingSafeEqual(sha256(presented), sha256(this.expectedToken));
  }
}

export const buildWebhookVerifier = (config: TranscorpConfig): WebhookVerifier | undefined => {
  const { webhook } = config.settings;
  const token = config.secrets.webhookToken;
  if (!webhook.enabled || !webhook.authHeaderName || !token) return undefined;
  return new SharedHeaderTokenVerifier(webhook.authHeaderName, token.reveal());
};

// ── replay / idempotency ────────────────────────────────────────────────────

export interface ReplayStore {
  /** Atomically claims the key. "duplicate" if it was already claimed within the TTL. */
  claim(key: string, ttlSeconds: number): Promise<"new" | "duplicate">;
  /** Releases a claim after a handler failure so the provider's retry can be processed. */
  release(key: string): Promise<void>;
}

export class RedisReplayStore implements ReplayStore {
  async claim(key: string, ttlSeconds: number): Promise<"new" | "duplicate"> {
    const res = await redis.set(`transcorp:webhook:${key}`, "1", "EX", ttlSeconds, "NX");
    return res === "OK" ? "new" : "duplicate";
  }

  async release(key: string): Promise<void> {
    await redis.del(`transcorp:webhook:${key}`);
  }
}

export class InMemoryReplayStore implements ReplayStore {
  private readonly seen = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async claim(key: string, ttlSeconds: number): Promise<"new" | "duplicate"> {
    const expiry = this.seen.get(key);
    if (expiry !== undefined && expiry > this.now()) return "duplicate";
    this.seen.set(key, this.now() + ttlSeconds * 1000);
    return "new";
  }

  async release(key: string): Promise<void> {
    this.seen.delete(key);
  }
}

// ── handler registry (empty by design) ──────────────────────────────────────

export interface WebhookEvent {
  eventType: string | undefined;
  eventId: string | undefined;
  /** In-memory only for the duration of the call; handlers must not persist it wholesale. */
  payload: Record<string, unknown>;
  requestId?: string;
  correlationId?: string;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

const handlers = new Map<string, WebhookHandler>();

/** Future provider slices register handlers by event type. None are registered in the foundation. */
export const registerWebhookHandler = (eventType: string, handler: WebhookHandler) => {
  handlers.set(eventType, handler);
};
export const clearWebhookHandlers = () => handlers.clear();

// ── gateway ─────────────────────────────────────────────────────────────────

export type WebhookOutcome =
  | { kind: "not_configured" }
  | { kind: "unauthorized" }
  | { kind: "invalid_payload" }
  | { kind: "store_unavailable" }
  | { kind: "duplicate" }
  | { kind: "accepted"; handled: boolean }
  | { kind: "handler_failed" };

const SAFE_ID = /^[A-Za-z0-9_.:\-]{1,128}$/;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export interface GatewayDeps {
  config: TranscorpConfig | undefined;
  replayStore: ReplayStore;
}

export const processWebhook = async (
  deps: GatewayDeps,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  ctx: { requestId?: string; correlationId?: string },
): Promise<WebhookOutcome> => {
  if (!deps.config) return { kind: "not_configured" };
  const verifier = buildWebhookVerifier(deps.config);
  if (!verifier) return { kind: "not_configured" };

  // Authenticate BEFORE looking at the body.
  if (!verifier.verify(headers)) return { kind: "unauthorized" };

  if (body === null || typeof body !== "object" || Array.isArray(body)) return { kind: "invalid_payload" };
  const payload = body as Record<string, unknown>;
  if (Object.keys(payload).length === 0) return { kind: "invalid_payload" }; // empty body parses to {}
  const { webhook } = deps.config.settings;

  const headerEventId = webhook.eventIdHeaderName ? headers[webhook.eventIdHeaderName.toLowerCase()] : undefined;
  if (typeof headerEventId === "string" && !SAFE_ID.test(headerEventId)) return { kind: "invalid_payload" };
  const eventId = typeof headerEventId === "string" ? headerEventId : undefined;

  const rawType = webhook.eventTypeField ? webhook.eventTypeField.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), payload) : undefined;
  const eventType = typeof rawType === "string" && SAFE_ID.test(rawType) ? rawType : undefined;

  // Replay key: provider event id when configured, otherwise a hash of the canonical body.
  const replayKey = createHash("sha256").update(eventId ?? stableStringify(payload)).digest("hex");

  let claim: "new" | "duplicate";
  try {
    claim = await deps.replayStore.claim(replayKey, webhook.replayTtlSeconds);
  } catch {
    // Fail closed: ask the provider to retry later rather than process without replay protection.
    return { kind: "store_unavailable" };
  }
  if (claim === "duplicate") return { kind: "duplicate" };

  const handler = eventType ? handlers.get(eventType) : undefined;
  if (!handler) return { kind: "accepted", handled: false };

  try {
    await handler({ eventType, eventId, payload, ...ctx });
    return { kind: "accepted", handled: true };
  } catch {
    await deps.replayStore.release(replayKey).catch(() => undefined);
    return { kind: "handler_failed" };
  }
};
