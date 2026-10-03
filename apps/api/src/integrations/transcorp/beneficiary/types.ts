import type { RequestContext } from "../client.js";

/**
 * Beneficiary provider seam (read-only).
 *
 * The Transcorp Beneficiary read contract (endpoint, method, lookup identifier,
 * response schema, status vocabulary, limit fields/semantics, not-found
 * semantics, and how a BAFT user maps to a provider customer) is NOT in this
 * repository and has not been verified, so NO Transcorp operation is defined
 * and NO adapter is registered. When the contract is confirmed, add
 * `operations/beneficiary.ts` (defineOperation + zod response schema), write an
 * adapter that maps the validated provider response into `NormalizedBeneficiary[]`,
 * and register it with `registerBeneficiaryAdapter()`.
 *
 * Adapter rules:
 *  - Run every call through TranscorpClient.execute() (never fetch directly).
 *  - Map provider status values to `BeneficiaryStatus`; anything unmapped → "unknown".
 *  - Return account/reference values already masked by the provider. Do not
 *    invent masking for formats you have not verified — omit the field instead.
 *  - Never return full account numbers, payment credentials, or raw provider ids.
 *  - Limits are intentionally NOT modelled: their fields and semantics are unknown.
 *  - Let TranscorpProviderError propagate; the service maps categories.
 */
export const BENEFICIARY_STATUSES = ["active", "inactive", "pending", "blocked", "unknown"] as const;
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number];

export interface NormalizedBeneficiary {
  status: BeneficiaryStatus;
  /** Provider-supplied display name, only if the contract permits showing it to admins. */
  displayName?: string;
  /** Provider-defined type label as named in the contract. */
  beneficiaryType?: string;
  /** Provider-masked account/reference only. */
  maskedReference?: string;
  /** ISO-8601. */
  addedAt?: string;
}

export interface BeneficiaryAdapter {
  /**
   * @param providerRef the provider-side identity resolved server-side from the
   *   BAFT user record. Never taken from the request.
   * @returns the user's beneficiaries (empty array when there are none).
   */
  list(providerRef: string, ctx: RequestContext): Promise<NormalizedBeneficiary[]>;
}
