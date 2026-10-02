import { isIP } from "node:net";
import { z } from "zod";
import { env } from "../../config/env.js";
import { SecretValue } from "./secret.js";

/**
 * Transcorp provider configuration.
 *
 * Two deliberately separate halves:
 *  - `settings`: non-secret (URLs, timeouts, header *names*, retry policy).
 *    Safe to log and to surface through the protected health endpoint.
 *  - `secrets`: credentials, wrapped in SecretValue. Come from environment
 *    variables only. Never logged, never returned from an API, never stored.
 *
 * Header NAMES and the auth scheme are configurable because the production
 * Transcorp contract has not been confirmed — nothing here assumes them.
 */

export type TranscorpEnvironment = "uat" | "production";
export type TranscorpAuthMode = "none" | "bearer" | "api_key_header" | "partner_headers";
export type TranscorpHost = "main" | "kyc";

export interface TranscorpHostSettings {
  /** Origin + optional path prefix, no trailing slash, no credentials/query. */
  baseUrl: string;
  origin: string;
  tenant?: string;
}

export interface TranscorpSettings {
  environment: TranscorpEnvironment;
  authMode: TranscorpAuthMode;
  authHeaderName?: string;
  partnerIdHeaderName?: string;
  partnerTokenHeaderName?: string;
  tenantHeaderName?: string;
  idempotencyHeaderName?: string;
  hosts: { main: TranscorpHostSettings; kyc?: TranscorpHostSettings };
  timeoutMs: number;
  totalTimeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  maxResponseBytes: number;
  maxConcurrentRequests: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  /** Provider health probe — TBD until Transcorp confirms a probe endpoint. */
  healthProbe?: { host: TranscorpHost; path: string };
  webhook: {
    enabled: boolean;
    authHeaderName?: string;
    eventIdHeaderName?: string;
    eventTypeField?: string;
    replayTtlSeconds: number;
  };
  /** Loopback http is tolerated only outside production-mode (local mock servers). */
  allowLoopbackHttp: boolean;
}

export interface TranscorpHostSecrets {
  authToken?: SecretValue;
  partnerId?: SecretValue;
  partnerToken?: SecretValue;
}

export interface TranscorpSecrets {
  main: TranscorpHostSecrets;
  kyc?: TranscorpHostSecrets;
  webhookToken?: SecretValue;
}

export interface TranscorpConfig {
  settings: TranscorpSettings;
  secrets: TranscorpSecrets;
}

export type TranscorpConfigResult =
  | { status: "disabled" }
  | { status: "invalid"; errors: string[] }
  | { status: "ready"; config: TranscorpConfig };

type Source = Record<string, string | undefined>;

const blankToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optStr = z.preprocess(blankToUndefined, z.string().optional());
const optHeaderName = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/, "must be a valid HTTP header name")
    .optional(),
);
const intWithDefault = (def: number, min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(def));

const rawSchema = z.object({
  TRANSCORP_ENABLED: z.preprocess(blankToUndefined, z.enum(["true", "false"]).default("false")),
  TRANSCORP_ENVIRONMENT: z.preprocess(blankToUndefined, z.enum(["uat", "production"]).default("uat")),
  TRANSCORP_AUTH_MODE: z.preprocess(
    blankToUndefined,
    z.enum(["none", "bearer", "api_key_header", "partner_headers"]).optional(),
  ),
  TRANSCORP_BASE_URL: optStr,
  TRANSCORP_KYC_BASE_URL: optStr,
  TRANSCORP_TENANT: optStr,
  TRANSCORP_KYC_TENANT: optStr,
  TRANSCORP_AUTH_HEADER_NAME: optHeaderName,
  TRANSCORP_PARTNER_ID_HEADER: optHeaderName,
  TRANSCORP_PARTNER_TOKEN_HEADER: optHeaderName,
  TRANSCORP_TENANT_HEADER: optHeaderName,
  TRANSCORP_IDEMPOTENCY_HEADER: optHeaderName,

  TRANSCORP_AUTH_TOKEN: optStr,
  TRANSCORP_PARTNER_ID: optStr,
  TRANSCORP_PARTNER_TOKEN: optStr,
  TRANSCORP_KYC_AUTH_TOKEN: optStr,
  TRANSCORP_KYC_PARTNER_ID: optStr,
  TRANSCORP_KYC_PARTNER_TOKEN: optStr,

  TRANSCORP_TIMEOUT_MS: intWithDefault(10_000, 100, 60_000),
  TRANSCORP_TOTAL_TIMEOUT_MS: intWithDefault(25_000, 100, 120_000),
  TRANSCORP_MAX_ATTEMPTS: intWithDefault(3, 1, 5),
  TRANSCORP_RETRY_BASE_DELAY_MS: intWithDefault(250, 0, 10_000),
  TRANSCORP_RETRY_MAX_DELAY_MS: intWithDefault(2_000, 0, 30_000),
  TRANSCORP_MAX_RESPONSE_BYTES: intWithDefault(2 * 1024 * 1024, 1024, 20 * 1024 * 1024),
  TRANSCORP_MAX_CONCURRENT_REQUESTS: intWithDefault(25, 1, 500),
  TRANSCORP_CIRCUIT_FAILURE_THRESHOLD: intWithDefault(5, 1, 100),
  TRANSCORP_CIRCUIT_COOLDOWN_MS: intWithDefault(30_000, 1_000, 600_000),

  TRANSCORP_HEALTH_PATH: optStr,
  TRANSCORP_HEALTH_HOST: z.preprocess(blankToUndefined, z.enum(["main", "kyc"]).default("main")),

  TRANSCORP_WEBHOOK_TOKEN: optStr,
  TRANSCORP_WEBHOOK_AUTH_HEADER: optHeaderName,
  TRANSCORP_WEBHOOK_EVENT_ID_HEADER: optHeaderName,
  TRANSCORP_WEBHOOK_EVENT_TYPE_FIELD: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_.]{1,64}$/, "must be a simple field name")
      .optional(),
  ),
  TRANSCORP_WEBHOOK_REPLAY_TTL_SECONDS: intWithDefault(86_400, 60, 604_800),
});

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";

const isPrivateOrReservedIp = (hostname: string): boolean => {
  const host = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (family === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local incl. cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = host.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("::ffff:")
    );
  }
  return false;
};

/** Validates a base URL taken from SERVER configuration. */
const parseBaseUrl = (
  label: string,
  value: string,
  allowLoopbackHttp: boolean,
): { error: string } | { settings: Omit<TranscorpHostSettings, "tenant"> } => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: `${label} is not a valid URL` };
  }
  if (url.username || url.password) return { error: `${label} must not embed credentials` };
  if (url.search || url.hash) return { error: `${label} must not contain a query string or fragment` };

  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === "http:") {
    if (!(allowLoopbackHttp && loopback)) return { error: `${label} must use https` };
  } else if (url.protocol !== "https:") {
    return { error: `${label} must use https` };
  }
  if (
    !loopback &&
    (isPrivateOrReservedIp(url.hostname) || url.hostname.endsWith(".internal") || url.hostname.endsWith(".local"))
  ) {
    return { error: `${label} must not point at a private, link-local or internal address` };
  }
  if (loopback && !allowLoopbackHttp) {
    return { error: `${label} must not point at a loopback address in this environment` };
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return { settings: { baseUrl: `${url.origin}${pathname}`, origin: url.origin } };
};

const SAFE_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;
/** A relative request path: leading single '/', no scheme/authority, no traversal, no query/fragment. */
export const isSafeRelativePath = (path: string): boolean => {
  if (!SAFE_PATH.test(path) || path.startsWith("//") || path.includes("\\")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  const hasControl = /[\u0000-\u001f]/.test(decoded);
  return !decoded.split("/").some((segment) => segment === "..") && !decoded.includes("//") && !hasControl;
};

/**
 * Pure loader (takes the env source as an argument so tests can exercise
 * every branch). Never throws and never includes a secret VALUE in `errors`.
 */
export const loadTranscorpConfig = (
  source: Source,
  nodeEnv: "development" | "test" | "production",
): TranscorpConfigResult => {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    return {
      status: "invalid",
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  const raw = parsed.data;
  if (raw.TRANSCORP_ENABLED !== "true") return { status: "disabled" };

  const errors: string[] = [];
  const environment = raw.TRANSCORP_ENVIRONMENT;
  const authMode = raw.TRANSCORP_AUTH_MODE;

  // Environment separation: a non-production deployment must never be able to
  // reach the production provider by config accident.
  if (environment === "production" && nodeEnv !== "production") {
    errors.push("TRANSCORP_ENVIRONMENT=production requires NODE_ENV=production");
  }
  const allowLoopbackHttp = nodeEnv !== "production" && environment !== "production";

  if (!authMode) errors.push("TRANSCORP_AUTH_MODE is required when TRANSCORP_ENABLED=true");
  if (authMode === "none" && (nodeEnv === "production" || environment === "production")) {
    errors.push("TRANSCORP_AUTH_MODE=none is not permitted in production");
  }

  if (!raw.TRANSCORP_BASE_URL) errors.push("TRANSCORP_BASE_URL is required when TRANSCORP_ENABLED=true");

  const mainUrl = raw.TRANSCORP_BASE_URL
    ? parseBaseUrl("TRANSCORP_BASE_URL", raw.TRANSCORP_BASE_URL, allowLoopbackHttp)
    : undefined;
  if (mainUrl && "error" in mainUrl) errors.push(mainUrl.error);
  const kycUrl = raw.TRANSCORP_KYC_BASE_URL
    ? parseBaseUrl("TRANSCORP_KYC_BASE_URL", raw.TRANSCORP_KYC_BASE_URL, allowLoopbackHttp)
    : undefined;
  if (kycUrl && "error" in kycUrl) errors.push(kycUrl.error);

  const wrap = (v: string | undefined) => (v ? new SecretValue(v) : undefined);
  const mainSecrets: TranscorpHostSecrets = {
    authToken: wrap(raw.TRANSCORP_AUTH_TOKEN),
    partnerId: wrap(raw.TRANSCORP_PARTNER_ID),
    partnerToken: wrap(raw.TRANSCORP_PARTNER_TOKEN),
  };
  const kycSecrets: TranscorpHostSecrets = {
    authToken: wrap(raw.TRANSCORP_KYC_AUTH_TOKEN),
    partnerId: wrap(raw.TRANSCORP_KYC_PARTNER_ID),
    partnerToken: wrap(raw.TRANSCORP_KYC_PARTNER_TOKEN),
  };

  // Credentials are per host and NOT shared: the Phase 0 notes say the KYC and
  // main hosts issue different credentials.
  const checkHostCredentials = (prefix: string, s: TranscorpHostSecrets) => {
    if (authMode === "bearer" || authMode === "api_key_header") {
      if (!s.authToken) errors.push(`${prefix}AUTH_TOKEN is required for TRANSCORP_AUTH_MODE=${authMode}`);
    }
    if (authMode === "partner_headers") {
      if (!s.partnerId) errors.push(`${prefix}PARTNER_ID is required for TRANSCORP_AUTH_MODE=partner_headers`);
      if (!s.partnerToken) errors.push(`${prefix}PARTNER_TOKEN is required for TRANSCORP_AUTH_MODE=partner_headers`);
    }
  };
  checkHostCredentials("TRANSCORP_", mainSecrets);
  if (raw.TRANSCORP_KYC_BASE_URL) checkHostCredentials("TRANSCORP_KYC_", kycSecrets);

  if (authMode === "api_key_header" && !raw.TRANSCORP_AUTH_HEADER_NAME) {
    errors.push("TRANSCORP_AUTH_HEADER_NAME is required for TRANSCORP_AUTH_MODE=api_key_header");
  }
  if (authMode === "partner_headers" && (!raw.TRANSCORP_PARTNER_ID_HEADER || !raw.TRANSCORP_PARTNER_TOKEN_HEADER)) {
    errors.push(
      "TRANSCORP_PARTNER_ID_HEADER and TRANSCORP_PARTNER_TOKEN_HEADER are required for TRANSCORP_AUTH_MODE=partner_headers",
    );
  }
  if ((raw.TRANSCORP_TENANT || raw.TRANSCORP_KYC_TENANT) && !raw.TRANSCORP_TENANT_HEADER) {
    errors.push("TRANSCORP_TENANT_HEADER is required when a tenant is configured (the header name is not assumed)");
  }

  if (raw.TRANSCORP_TIMEOUT_MS > raw.TRANSCORP_TOTAL_TIMEOUT_MS) {
    errors.push("TRANSCORP_TIMEOUT_MS must not exceed TRANSCORP_TOTAL_TIMEOUT_MS");
  }
  if (raw.TRANSCORP_RETRY_BASE_DELAY_MS > raw.TRANSCORP_RETRY_MAX_DELAY_MS) {
    errors.push("TRANSCORP_RETRY_BASE_DELAY_MS must not exceed TRANSCORP_RETRY_MAX_DELAY_MS");
  }

  let healthProbe: TranscorpSettings["healthProbe"];
  if (raw.TRANSCORP_HEALTH_PATH) {
    if (!isSafeRelativePath(raw.TRANSCORP_HEALTH_PATH)) {
      errors.push("TRANSCORP_HEALTH_PATH must be a relative path starting with '/'");
    } else if (raw.TRANSCORP_HEALTH_HOST === "kyc" && !raw.TRANSCORP_KYC_BASE_URL) {
      errors.push("TRANSCORP_HEALTH_HOST=kyc requires TRANSCORP_KYC_BASE_URL");
    } else {
      healthProbe = { host: raw.TRANSCORP_HEALTH_HOST, path: raw.TRANSCORP_HEALTH_PATH };
    }
  }

  // Webhook is opt-in by presence of the token; its header names are not guessed.
  const webhookEnabled = Boolean(raw.TRANSCORP_WEBHOOK_TOKEN);
  if (webhookEnabled && !raw.TRANSCORP_WEBHOOK_AUTH_HEADER) {
    errors.push(
      "TRANSCORP_WEBHOOK_AUTH_HEADER is required when TRANSCORP_WEBHOOK_TOKEN is set (the header name is not assumed)",
    );
  }

  if (errors.length > 0 || !mainUrl || "error" in mainUrl || !authMode || (kycUrl && "error" in kycUrl)) {
    return { status: "invalid", errors };
  }

  return {
    status: "ready",
    config: {
      settings: {
        environment,
        authMode,
        authHeaderName: raw.TRANSCORP_AUTH_HEADER_NAME,
        partnerIdHeaderName: raw.TRANSCORP_PARTNER_ID_HEADER,
        partnerTokenHeaderName: raw.TRANSCORP_PARTNER_TOKEN_HEADER,
        tenantHeaderName: raw.TRANSCORP_TENANT_HEADER,
        idempotencyHeaderName: raw.TRANSCORP_IDEMPOTENCY_HEADER,
        hosts: {
          main: { ...mainUrl.settings, tenant: raw.TRANSCORP_TENANT },
          kyc: kycUrl ? { ...kycUrl.settings, tenant: raw.TRANSCORP_KYC_TENANT } : undefined,
        },
        timeoutMs: raw.TRANSCORP_TIMEOUT_MS,
        totalTimeoutMs: raw.TRANSCORP_TOTAL_TIMEOUT_MS,
        maxAttempts: raw.TRANSCORP_MAX_ATTEMPTS,
        retryBaseDelayMs: raw.TRANSCORP_RETRY_BASE_DELAY_MS,
        retryMaxDelayMs: raw.TRANSCORP_RETRY_MAX_DELAY_MS,
        maxResponseBytes: raw.TRANSCORP_MAX_RESPONSE_BYTES,
        maxConcurrentRequests: raw.TRANSCORP_MAX_CONCURRENT_REQUESTS,
        circuitFailureThreshold: raw.TRANSCORP_CIRCUIT_FAILURE_THRESHOLD,
        circuitCooldownMs: raw.TRANSCORP_CIRCUIT_COOLDOWN_MS,
        healthProbe,
        webhook: {
          enabled: webhookEnabled,
          authHeaderName: raw.TRANSCORP_WEBHOOK_AUTH_HEADER,
          eventIdHeaderName: raw.TRANSCORP_WEBHOOK_EVENT_ID_HEADER,
          eventTypeField: raw.TRANSCORP_WEBHOOK_EVENT_TYPE_FIELD,
          replayTtlSeconds: raw.TRANSCORP_WEBHOOK_REPLAY_TTL_SECONDS,
        },
        allowLoopbackHttp,
      },
      secrets: {
        main: mainSecrets,
        kyc: raw.TRANSCORP_KYC_BASE_URL ? kycSecrets : undefined,
        webhookToken: wrap(raw.TRANSCORP_WEBHOOK_TOKEN),
      },
    },
  };
};

/** Every secret value in the config — used by the redactor to scrub logs defensively. */
export const collectSecretValues = (secrets: TranscorpSecrets): string[] => {
  const values: string[] = [];
  for (const host of [secrets.main, secrets.kyc]) {
    if (!host) continue;
    for (const s of [host.authToken, host.partnerId, host.partnerToken]) if (s) values.push(s.reveal());
  }
  if (secrets.webhookToken) values.push(secrets.webhookToken.reveal());
  return values;
};

let cached: TranscorpConfigResult | undefined;

/** Process-wide config, loaded once from the validated environment. */
export const getTranscorpConfigResult = (): TranscorpConfigResult => {
  cached ??= loadTranscorpConfig(process.env, env.NODE_ENV);
  return cached;
};

/** Test hook. */
export const resetTranscorpConfigCache = () => {
  cached = undefined;
};

/** Non-secret summary, safe for the protected health endpoint and logs. */
export const summarizeSettings = (s: TranscorpSettings) => ({
  environment: s.environment,
  authMode: s.authMode,
  hosts: { main: s.hosts.main.origin, kyc: s.hosts.kyc?.origin ?? null },
  timeoutMs: s.timeoutMs,
  totalTimeoutMs: s.totalTimeoutMs,
  maxAttempts: s.maxAttempts,
  probeConfigured: Boolean(s.healthProbe),
  webhookConfigured: s.webhook.enabled,
});
