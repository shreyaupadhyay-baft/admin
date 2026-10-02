import type { RequestContext } from "../client.js";

/**
 * KYC provider seam.
 *
 * The Transcorp KYC read contract (endpoint, method, request params, response
 * schema, error semantics, and how a BAFT user maps to a provider customer)
 * is NOT in this repository and has not been verified, so NO Transcorp
 * operation is defined yet. When the contract is confirmed, add
 * `operations/kyc.ts` (defineOperation + zod response schema), write an adapter
 * that maps the validated provider response into `NormalizedKyc`, and register
 * it with `registerKycAdapter()`. Nothing else in the module changes.
 *
 * Adapter rules:
 *  - Run every call through TranscorpClient.execute() (never fetch directly).
 *  - Map provider status values to `KycStatus`; anything unmapped → "unknown".
 *  - Return identifiers already masked by the provider. Do not invent masking
 *    for formats you have not verified — omit the field instead.
 *  - Never return document images/numbers, OTPs or credentials.
 *  - Let TranscorpProviderError propagate; the service maps categories.
 */
export const KYC_STATUSES = ["not_started", "pending", "verified", "rejected", "expired", "unknown"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export interface NormalizedKyc {
  status: KycStatus;
  /** ISO-8601. */
  verifiedAt?: string;
  /** Provider-defined method/type label, e.g. as named in the contract. */
  verificationMethod?: string;
  /** Provider-masked reference only. */
  verificationReference?: string;
  /** Only when the contract exposes it and policy permits showing it to admins. */
  declineReason?: string;
}

export interface KycAdapter {
  /**
   * @param providerRef the provider-side identity resolved server-side from the
   *   BAFT user record. Never taken from the request.
   */
  lookup(providerRef: string, ctx: RequestContext): Promise<NormalizedKyc>;
}
