import type { ZodType } from "zod";
import type { TranscorpHost } from "../config.js";
import { isSafeRelativePath } from "../config.js";

/**
 * Provider operation registry contract.
 *
 * Every call to Transcorp is described by a `TranscorpOperation`: fixed host,
 * method, relative path, request/response schemas and retry/idempotency
 * policy. The client accepts ONLY these objects — controllers and services
 * cannot hand it a URL, so there is no generic HTTP access and no SSRF
 * surface from user input.
 *
 * ── Retry / idempotency policy ────────────────────────────────────────────
 * kind "read"  : may be retried on transient failures (timeout, network,
 *                5xx, 429 with a short Retry-After). Bounded by maxAttempts
 *                and the total time budget.
 * kind "write" : retried ONLY when `idempotency` is "natural" (repeating the
 *                request is provably harmless) or "key" (the provider honours
 *                an idempotency key, sent in TRANSCORP_IDEMPOTENCY_HEADER).
 *                The default is "none" → exactly one attempt. Do NOT mark a
 *                write "natural"/"key" until the Transcorp contract confirms
 *                it — an unverified claim here can double-spend.
 */
export type OperationKind = "read" | "write";
export type OperationIdempotency = "none" | "natural" | "key";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | undefined;

export interface TranscorpOperation<TParams = void, TBody = undefined, TResponse = unknown> {
  /** Stable dotted name used in logs/metrics, e.g. "transactions.lookup". */
  readonly name: string;
  readonly host: TranscorpHost;
  readonly method: HttpMethod;
  readonly kind: OperationKind;
  readonly idempotency: OperationIdempotency;
  /** Returns a RELATIVE path. Build segments with `pathSegment()`. */
  readonly path: (params: TParams) => string;
  readonly query?: (params: TParams) => Record<string, QueryValue>;
  readonly requestSchema?: ZodType<TBody>;
  /** Provider JSON is untrusted: it must parse through this before leaving the client. */
  readonly responseSchema: ZodType<TResponse>;
  /** Overrides the configured attempt count downwards (e.g. 1 for health probes). */
  readonly maxAttempts?: number;
}

export const defineOperation = <TParams = void, TBody = undefined, TResponse = unknown>(
  op: TranscorpOperation<TParams, TBody, TResponse>,
): TranscorpOperation<TParams, TBody, TResponse> => {
  if (!/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(op.name)) {
    throw new Error(`Invalid Transcorp operation name: ${op.name}`);
  }
  if (op.kind === "read" && op.idempotency !== "none") {
    throw new Error(`Operation ${op.name}: idempotency applies to writes only`);
  }
  // POST is allowed for reads because some APIs use it for search/lookup.
  if (op.kind === "read" && op.method !== "GET" && op.method !== "POST") {
    throw new Error(`Operation ${op.name}: ${op.method} cannot be a read`);
  }
  if (op.kind === "write" && op.method === "GET") {
    throw new Error(`Operation ${op.name}: GET cannot be a write`);
  }
  return Object.freeze(op);
};

/** Safely encodes one user/data-derived value as exactly one path segment. */
export const pathSegment = (value: string | number): string => {
  const s = String(value);
  if (s.length === 0 || s.length > 128 || s === "." || s === "..") {
    throw new Error("Invalid path segment");
  }
  return encodeURIComponent(s);
};

/** Throws on anything that is not a clean relative path. The client re-checks this on every call. */
export const assertSafePath = (path: string): void => {
  if (!isSafeRelativePath(path)) throw new Error("Unsafe provider path");
};
