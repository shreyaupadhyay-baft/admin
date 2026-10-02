import { AppError } from "../../utils/response.js";

/**
 * Normalized provider failure categories. Every failure that can occur at the
 * Transcorp boundary maps to exactly one of these.
 */
export type ProviderErrorCategory =
  | "authentication" // 401/403 — BAFT's credentials/entitlement are wrong, NOT the admin's session
  | "validation" // 4xx other than 401/403/404/429 — provider rejected the request
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network"
  | "provider_5xx"
  | "malformed_response" // non-JSON, schema mismatch, oversize, unexpected 1xx/3xx
  | "not_configured"
  | "circuit_open"
  | "invalid_request"; // BAFT-side programming error (bad path/body) — never sent

interface CategoryPolicy {
  httpStatus: number;
  code: string;
  /** Fixed, frontend-safe text. Provider text is never echoed to clients. */
  message: string;
  /** Whether a *read* of this category may be retried. Writes additionally need idempotency. */
  retryable: boolean;
}

export const CATEGORY_POLICY: Record<ProviderErrorCategory, CategoryPolicy> = {
  // 502, deliberately not 401/403: the frontend treats 401 as "session expired" and would log the admin out.
  authentication: {
    httpStatus: 502,
    code: "PROVIDER_AUTH_FAILED",
    message: "The payment provider rejected BAFT's credentials. Please contact engineering.",
    retryable: false,
  },
  validation: {
    httpStatus: 422,
    code: "PROVIDER_REJECTED_REQUEST",
    message: "The payment provider could not process this request.",
    retryable: false,
  },
  not_found: {
    httpStatus: 404,
    code: "PROVIDER_RESOURCE_NOT_FOUND",
    message: "The requested record was not found at the payment provider.",
    retryable: false,
  },
  rate_limited: {
    httpStatus: 429,
    code: "PROVIDER_RATE_LIMITED",
    message: "The payment provider is rate limiting requests. Please try again shortly.",
    retryable: true,
  },
  timeout: {
    httpStatus: 504,
    code: "PROVIDER_TIMEOUT",
    message: "The payment provider did not respond in time.",
    retryable: true,
  },
  network: {
    httpStatus: 502,
    code: "PROVIDER_UNAVAILABLE",
    message: "The payment provider could not be reached.",
    retryable: true,
  },
  provider_5xx: {
    httpStatus: 502,
    code: "PROVIDER_ERROR",
    message: "The payment provider reported an internal error.",
    retryable: true,
  },
  malformed_response: {
    httpStatus: 502,
    code: "PROVIDER_BAD_RESPONSE",
    message: "The payment provider returned an unexpected response.",
    retryable: false,
  },
  not_configured: {
    httpStatus: 503,
    code: "PROVIDER_NOT_CONFIGURED",
    message: "The payment provider integration is not configured.",
    retryable: false,
  },
  circuit_open: {
    httpStatus: 503,
    code: "PROVIDER_UNAVAILABLE",
    message: "The payment provider is temporarily unavailable.",
    retryable: false,
  },
  invalid_request: {
    httpStatus: 500,
    code: "PROVIDER_REQUEST_INVALID",
    message: "An unexpected error occurred.",
    retryable: false,
  },
};

export interface ProviderErrorInternal {
  operation: string;
  httpStatus?: number;
  attempts?: number;
  /** Provider-supplied error code, only kept if short and token-shaped. */
  providerErrorCode?: string;
  /** BAFT-authored diagnostic text (never provider free text). Never sent to clients. */
  detail?: string;
  retryAfterMs?: number;
}

/**
 * Extends AppError so the existing errorHandler serialises it into the
 * standard `{ error: { code, message, request_id } }` envelope with no change.
 * `.message` is the fixed safe text; everything else stays server-side.
 */
export class TranscorpProviderError extends AppError {
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly internal: ProviderErrorInternal;

  constructor(category: ProviderErrorCategory, internal: ProviderErrorInternal) {
    const policy = CATEGORY_POLICY[category];
    super(policy.code, policy.message, policy.httpStatus);
    this.name = "TranscorpProviderError";
    this.category = category;
    this.retryable = policy.retryable;
    this.internal = internal;
  }

  /** Safe for logs: never contains the provider response body or any credential. */
  toLogFields() {
    return { category: this.category, errorCode: this.code, ...this.internal };
  }
}

export const isTranscorpProviderError = (err: unknown): err is TranscorpProviderError =>
  err instanceof TranscorpProviderError;
