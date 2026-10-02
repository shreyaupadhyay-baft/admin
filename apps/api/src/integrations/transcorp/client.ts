import { randomInt } from "node:crypto";
import { logWithContext } from "../../utils/logger.js";
import { collectSecretValues, getTranscorpConfigResult, type TranscorpConfig, type TranscorpHost, type TranscorpHostSecrets } from "./config.js";
import { TranscorpProviderError, type ProviderErrorCategory } from "./errors.js";
import { assertSafePath, type TranscorpOperation } from "./operations/types.js";
import { redactString } from "./redact.js";

/**
 * The single egress point to Transcorp.
 *
 *   Controller → BAFT service/use case → TranscorpClient.execute(operation) → Transcorp
 *
 * - Accepts only registered `TranscorpOperation`s; callers cannot supply a URL.
 * - Base URL, credentials and header names come exclusively from server config.
 * - Redirects are never followed (an open redirect must not move us off-host).
 * - Responses are size-capped, parsed and schema-validated before returning.
 * - Retries are bounded (attempts + total time budget), jittered, and limited
 *   to reads / explicitly idempotent writes.
 * - A small circuit breaker and concurrency cap stop retry storms and keep a
 *   provider outage from exhausting this process.
 * - Errors are normalised to `TranscorpProviderError`; raw provider payloads
 *   are never exposed or logged.
 */

export interface RequestContext {
  requestId?: string;
  correlationId?: string;
}

export interface ExecuteInput<TParams, TBody> {
  params?: TParams;
  body?: TBody;
  /** Only used for operations with idempotency "key". */
  idempotencyKey?: string;
}

export interface TranscorpClientDeps {
  config: TranscorpConfig;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Returns a float in [0, 1). Injectable for deterministic tests. */
  random?: () => number;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const defaultRandom = () => randomInt(0, 1_000_000) / 1_000_000;

class ResponseTooLargeError extends Error {}

type CircuitState = "closed" | "open" | "half_open";

class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: CircuitState = "closed";

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number,
  ) {}

  /** Throws-free check. Returns false if the call must be rejected. */
  allow(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half_open"; // exactly one trial request
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure() {
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  /** A non-health failure (e.g. 404) during a half-open trial proves the provider is reachable. */
  recordReachable() {
    if (this.state === "half_open") this.recordSuccess();
  }

  snapshot() {
    return { state: this.state, consecutiveFailures: this.failures };
  }
}

/** Failures that indicate provider/transport health problems (drive the circuit breaker). */
const HEALTH_CATEGORIES: ReadonlySet<ProviderErrorCategory> = new Set(["timeout", "network", "provider_5xx", "malformed_response"]);

const TOKEN_SHAPED = /^[A-Za-z0-9_.:-]{1,64}$/;

export class TranscorpClient {
  private readonly config: TranscorpConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly breaker: CircuitBreaker;
  private readonly secretValues: string[];
  private inFlight = 0;

  constructor(deps: TranscorpClientDeps) {
    this.config = deps.config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? defaultRandom;
    this.now = deps.now ?? Date.now;
    this.breaker = new CircuitBreaker(
      this.config.settings.circuitFailureThreshold,
      this.config.settings.circuitCooldownMs,
      this.now,
    );
    this.secretValues = collectSecretValues(this.config.secrets);
  }

  get circuit() {
    return this.breaker.snapshot();
  }

  async execute<TParams, TBody, TResponse>(
    operation: TranscorpOperation<TParams, TBody, TResponse>,
    input: ExecuteInput<TParams, TBody>,
    ctx: RequestContext = {},
  ): Promise<TResponse> {
    const startedAt = this.now();
    const s = this.config.settings;
    const base = { provider: "transcorp", operation: operation.name, requestId: ctx.requestId, correlationId: ctx.correlationId };

    const fail = (category: ProviderErrorCategory, internal: Omit<ConstructorParameters<typeof TranscorpProviderError>[1], "operation">) =>
      new TranscorpProviderError(category, { operation: operation.name, ...internal });

    // ── Pre-flight (nothing has left the process yet) ──────────────────────
    let url: URL;
    let serializedBody: string | undefined;
    try {
      url = this.buildUrl(operation, input.params as TParams);
      if (operation.requestSchema) {
        const parsed = operation.requestSchema.safeParse(input.body);
        if (!parsed.success) {
          throw fail("invalid_request", { detail: `request body failed schema: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}` });
        }
        serializedBody = JSON.stringify(parsed.data);
      } else if (input.body !== undefined) {
        throw fail("invalid_request", { detail: "operation does not accept a request body" });
      }
    } catch (err) {
      const error = err instanceof TranscorpProviderError ? err : fail("invalid_request", { detail: "could not build request" });
      this.logFinal(base, error, startedAt, 0);
      throw error;
    }

    let headers: Record<string, string>;
    try {
      headers = this.buildHeaders(operation, input, ctx, serializedBody !== undefined);
    } catch (err) {
      const error = err instanceof TranscorpProviderError ? err : fail("not_configured", { detail: "could not build headers" });
      this.logFinal(base, error, startedAt, 0);
      throw error;
    }

    if (this.inFlight >= s.maxConcurrentRequests) {
      const error = fail("circuit_open", { detail: "concurrency limit reached" });
      this.logFinal(base, error, startedAt, 0);
      throw error;
    }
    if (!this.breaker.allow()) {
      const error = fail("circuit_open", {});
      this.logFinal(base, error, startedAt, 0);
      throw error;
    }

    // ── Attempt loop ───────────────────────────────────────────────────────
    const maxAttempts = this.attemptsAllowed(operation, input);
    this.inFlight += 1;
    let attempt = 0;
    try {
      for (;;) {
        attempt += 1;
        const elapsed = this.now() - startedAt;
        const remaining = s.totalTimeoutMs - elapsed;
        try {
          const value = await this.attemptOnce(operation, url, headers, serializedBody, Math.min(s.timeoutMs, remaining), attempt);
          this.breaker.recordSuccess();
          this.logFinal(base, undefined, startedAt, attempt, 200);
          return value;
        } catch (err) {
          const error =
            err instanceof TranscorpProviderError ? err : fail("network", { attempts: attempt, detail: "unclassified transport failure" });
          error.internal.attempts = attempt;

          const delay = this.retryDelayMs(error, attempt);
          const budgetLeft = s.totalTimeoutMs - (this.now() - startedAt);
          const canRetry = error.retryable && attempt < maxAttempts && delay !== null && delay < budgetLeft;
          if (!canRetry) {
            if (HEALTH_CATEGORIES.has(error.category)) this.breaker.recordFailure();
            else this.breaker.recordReachable();
            this.logFinal(base, error, startedAt, attempt);
            throw error;
          }
          logWithContext("warn", "transcorp_request_retry", {
            ...base,
            attempt,
            nextDelayMs: delay,
            category: error.category,
            httpStatus: error.internal.httpStatus,
          });
          await this.sleep(delay);
        }
      }
    } finally {
      this.inFlight -= 1;
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private attemptsAllowed<TParams, TBody, TResponse>(op: TranscorpOperation<TParams, TBody, TResponse>, input: ExecuteInput<TParams, TBody>): number {
    const s = this.config.settings;
    let max = Math.min(s.maxAttempts, op.maxAttempts ?? s.maxAttempts);
    if (op.kind === "write") {
      const safe =
        op.idempotency === "natural" ||
        (op.idempotency === "key" && Boolean(s.idempotencyHeaderName) && Boolean(input.idempotencyKey));
      if (!safe) max = 1;
    }
    return Math.max(1, max);
  }

  /** null = do not retry. Full-jitter exponential backoff, capped. */
  private retryDelayMs(error: TranscorpProviderError, attempt: number): number | null {
    const s = this.config.settings;
    if (error.category === "rate_limited") {
      const ra = error.internal.retryAfterMs;
      // Honour Retry-After only if it fits inside our own cap; otherwise surface the 429.
      return ra !== undefined && ra <= s.retryMaxDelayMs ? ra : null;
    }
    const ceiling = Math.min(s.retryMaxDelayMs, s.retryBaseDelayMs * 2 ** (attempt - 1));
    return Math.floor(this.random() * (ceiling + 1));
  }

  private hostConfig(host: TranscorpHost) {
    const settings = host === "kyc" ? this.config.settings.hosts.kyc : this.config.settings.hosts.main;
    const secrets = host === "kyc" ? this.config.secrets.kyc : this.config.secrets.main;
    if (!settings || !secrets) {
      throw new TranscorpProviderError("not_configured", { operation: "n/a", detail: `host "${host}" is not configured` });
    }
    return { settings, secrets };
  }

  private buildUrl<TParams, TBody, TResponse>(op: TranscorpOperation<TParams, TBody, TResponse>, params: TParams): URL {
    const { settings } = this.hostConfig(op.host);
    const path = op.path(params);
    assertSafePath(path);

    const url = new URL(`${settings.baseUrl}${path}`);
    const query = op.query?.(params) ?? {};
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    // SSRF guard: whatever the path builder returned, we must still be on the configured origin.
    if (url.origin !== settings.origin) {
      throw new TranscorpProviderError("invalid_request", { operation: op.name, detail: "resolved origin differs from configured origin" });
    }
    return url;
  }

  private buildHeaders<TParams, TBody, TResponse>(
    op: TranscorpOperation<TParams, TBody, TResponse>,
    input: ExecuteInput<TParams, TBody>,
    ctx: RequestContext,
    hasBody: boolean,
  ): Record<string, string> {
    const s = this.config.settings;
    const { settings: host, secrets } = this.hostConfig(op.host);
    const headers: Record<string, string> = { accept: "application/json" };
    if (hasBody) headers["content-type"] = "application/json";
    if (ctx.correlationId) headers["x-correlation-id"] = ctx.correlationId;
    if (ctx.requestId) headers["x-baft-request-id"] = ctx.requestId;

    this.applyAuth(headers, secrets, op.name);
    if (host.tenant && s.tenantHeaderName) headers[s.tenantHeaderName.toLowerCase()] = host.tenant;
    if (op.kind === "write" && op.idempotency === "key" && input.idempotencyKey && s.idempotencyHeaderName) {
      headers[s.idempotencyHeaderName.toLowerCase()] = input.idempotencyKey;
    }
    return headers;
  }

  private applyAuth(headers: Record<string, string>, secrets: TranscorpHostSecrets, operation: string) {
    const s = this.config.settings;
    const missing = () => new TranscorpProviderError("not_configured", { operation, detail: "credentials missing for configured auth mode" });
    switch (s.authMode) {
      case "none":
        return;
      case "bearer":
        if (!secrets.authToken) throw missing();
        headers["authorization"] = `Bearer ${secrets.authToken.reveal()}`;
        return;
      case "api_key_header":
        if (!secrets.authToken || !s.authHeaderName) throw missing();
        headers[s.authHeaderName.toLowerCase()] = secrets.authToken.reveal();
        return;
      case "partner_headers":
        if (!secrets.partnerId || !secrets.partnerToken || !s.partnerIdHeaderName || !s.partnerTokenHeaderName) throw missing();
        headers[s.partnerIdHeaderName.toLowerCase()] = secrets.partnerId.reveal();
        headers[s.partnerTokenHeaderName.toLowerCase()] = secrets.partnerToken.reveal();
        return;
    }
  }

  private async attemptOnce<TParams, TBody, TResponse>(
    op: TranscorpOperation<TParams, TBody, TResponse>,
    url: URL,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number,
    attempt: number,
  ): Promise<TResponse> {
    const s = this.config.settings;
    const mk = (category: ProviderErrorCategory, extra: Record<string, unknown> = {}) =>
      new TranscorpProviderError(category, { operation: op.name, attempts: attempt, ...extra });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, timeoutMs));

    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: op.method,
          headers,
          body,
          signal: controller.signal,
          redirect: "manual",
        });
      } catch (err) {
        throw this.transportError(err, timedOut, op.name, attempt, op.kind);
      }

      const status = res.status;
      const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"), this.now());
      let text: string;
      try {
        text = await readBounded(res, s.maxResponseBytes);
      } catch (err) {
        if (err instanceof ResponseTooLargeError) throw mk("malformed_response", { httpStatus: status, detail: "response exceeded size limit" });
        throw this.transportError(err, timedOut, op.name, attempt, op.kind, status);
      }

      if (status >= 200 && status < 300) {
        return this.parseSuccess(op, res, text, attempt);
      }

      const providerErrorCode = extractErrorCode(text);
      // Provider free text is deliberately NOT retained: it can carry PII/OTPs that no regex reliably scrubs.
      const internal = { httpStatus: status, providerErrorCode, retryAfterMs };
      if (status === 401 || status === 403) throw mk("authentication", internal);
      if (status === 404) throw mk("not_found", internal);
      if (status === 408) throw mk("timeout", internal);
      if (status === 429) throw mk("rate_limited", internal);
      if (status >= 500) throw mk("provider_5xx", internal);
      if (status >= 400) throw mk("validation", internal);
      // 1xx / 3xx: we never follow redirects, so this is unexpected provider behaviour.
      throw mk("malformed_response", { httpStatus: status, detail: "unexpected non-2xx/4xx/5xx status" });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseSuccess<TParams, TBody, TResponse>(
    op: TranscorpOperation<TParams, TBody, TResponse>,
    res: Response,
    text: string,
    attempt: number,
  ): TResponse {
    const status = res.status;
    const bad = (detail: string) => new TranscorpProviderError("malformed_response", { operation: op.name, attempts: attempt, httpStatus: status, detail });

    let json: unknown = undefined;
    if (text.length > 0) {
      const contentType = res.headers.get("content-type") ?? "";
      if (!/\bjson\b/i.test(contentType)) throw bad("success response was not JSON");
      try {
        json = JSON.parse(text);
      } catch {
        throw bad("response body was not valid JSON");
      }
    }
    const parsed = op.responseSchema.safeParse(json);
    if (!parsed.success) {
      // Field paths only — never values — so provider data can't leak via the error.
      throw bad(`response failed schema validation at: ${[...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10).join(", ")}`);
    }
    return parsed.data;
  }

  private transportError(err: unknown, timedOut: boolean, operation: string, attempt: number, kind: "read" | "write", httpStatus?: number) {
    const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
    const code = typeof cause?.code === "string" && TOKEN_SHAPED.test(cause.code) ? cause.code : undefined;
    const category: ProviderErrorCategory = timedOut ? "timeout" : "network";
    return new TranscorpProviderError(category, {
      operation,
      attempts: attempt,
      httpStatus,
      detail: [timedOut ? "request timed out" : `transport failure${code ? ` (${code})` : ""}`, kind === "write" ? "request may have been processed by the provider" : ""]
        .filter(Boolean)
        .join("; "),
    });
  }

  /** One structured line per provider call. No headers, no bodies. */
  private logFinal(
    base: Record<string, unknown>,
    error: TranscorpProviderError | undefined,
    startedAt: number,
    attempts: number,
    httpStatus?: number,
  ) {
    const latencyMs = this.now() - startedAt;
    if (!error) {
      logWithContext("info", "transcorp_request", { ...base, outcome: "success", httpStatus, attempts, latencyMs });
      return;
    }
    logWithContext("warn", "transcorp_request", {
      ...base,
      outcome: "failure",
      latencyMs,
      attempts,
      ...error.toLogFields(),
      detail: error.internal.detail ? redactString(error.internal.detail, this.secretValues) : undefined,
    });
  }
}

const parseRetryAfter = (header: string | null, now: number): number | undefined => {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
};

const readBounded = async (res: Response, maxBytes: number): Promise<string> => {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new ResponseTooLargeError();
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
};

/** Keeps a provider error code only if it is short and token-shaped (no free text, no PII). */
const extractErrorCode = (text: string): string | undefined => {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    for (const key of ["code", "errorCode", "error_code"]) {
      const v = json?.[key];
      if ((typeof v === "string" || typeof v === "number") && TOKEN_SHAPED.test(String(v))) return String(v);
    }
  } catch {
    /* not JSON — ignore */
  }
  return undefined;
};

// ── process-wide instance ─────────────────────────────────────────────────

let instance: TranscorpClient | undefined;

/**
 * Lazily builds the shared client. Throws a normalised `not_configured`
 * provider error when the integration is disabled/invalid — this is the ONLY
 * place unconfigured state is surfaced, so unrelated modules never notice.
 */
export const getTranscorpClient = (): TranscorpClient => {
  if (instance) return instance;
  const result = getTranscorpConfigResult();
  if (result.status !== "ready") {
    throw new TranscorpProviderError("not_configured", {
      operation: "n/a",
      detail: result.status === "disabled" ? "integration disabled" : "configuration invalid",
    });
  }
  instance = new TranscorpClient({ config: result.config });
  return instance;
};

/** Test hook. */
export const resetTranscorpClient = (replacement?: TranscorpClient) => {
  instance = replacement;
};
