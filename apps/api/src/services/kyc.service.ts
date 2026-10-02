import type { Request } from "express";
import { z } from "zod";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { getTranscorpConfigResult } from "../integrations/transcorp/config.js";
import { isTranscorpProviderError } from "../integrations/transcorp/errors.js";
import { getKycAdapter } from "../integrations/transcorp/kyc/registry.js";
import { KYC_STATUSES } from "../integrations/transcorp/kyc/types.js";
import { findUserById } from "../repositories/user.repository.js";
import { AppError } from "../utils/response.js";
import { recordAudit } from "./audit.service.js";

/**
 * Admin-safe KYC DTO. This schema is the allow-list: anything not named here
 * is dropped, strings are length-capped, and the result is built fresh (never
 * a pass-through of provider or normalized objects).
 */
const kycDtoSchema = z.object({
  status: z.enum(KYC_STATUSES),
  verifiedAt: z.string().datetime({ offset: true }).optional(),
  verificationMethod: z.string().max(64).optional(),
  verificationReference: z.string().max(64).optional(),
  declineReason: z.string().max(200).optional(),
});
export type KycDto = z.infer<typeof kycDtoSchema>;

/** "available" is the only state carrying KYC data; the rest are explicit empty states, not errors. */
export type KycLookupState =
  | "available"
  | "no_provider_relationship" // user has no provider linkage (external_ref empty)
  | "not_found" // provider has no KYC record for this user
  | "not_configured" // Transcorp integration disabled/invalid
  | "unverified"; // integration configured but the KYC contract/adapter is not yet wired

export interface KycLookupResult {
  source: "transcorp";
  state: KycLookupState;
  kyc: KycDto | null;
}

const AUDIT_OPERATION = "kyc.lookup";

/**
 * authorise (route middleware: kyc.read) → resolve BAFT user → resolve the
 * provider identity SERVER-SIDE → provider call via the Transcorp client →
 * validate/minimise → audit.
 *
 * The provider reference never comes from the request and is never returned.
 */
export const lookupKycForUser = async (req: Request, userId: string): Promise<KycLookupResult> => {
  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);

  const audit = (outcome: string) =>
    recordAudit(req, AUDIT_ACTIONS.KYC_VIEWED, {
      actorAdminId: req.admin?.id ?? null,
      targetType: "user",
      targetId: user.id,
      // Minimal investigation metadata only. Never KYC data or the provider reference.
      metadata: { operation: AUDIT_OPERATION, provider: "transcorp", outcome },
    });

  const done = async (state: KycLookupState, kyc: KycDto | null = null): Promise<KycLookupResult> => {
    await audit(state);
    return { source: "transcorp", state, kyc };
  };

  const providerRef = user.external_ref?.trim();
  if (!providerRef) return done("no_provider_relationship");

  const config = getTranscorpConfigResult();
  if (config.status !== "ready") return done("not_configured");

  const adapter = getKycAdapter();
  if (!adapter) return done("unverified");

  let normalized: unknown;
  try {
    normalized = await adapter.lookup(providerRef, {
      requestId: req.requestId,
      correlationId: req.correlationId,
    });
  } catch (err) {
    if (isTranscorpProviderError(err)) {
      if (err.category === "not_found") return done("not_found");
      if (err.category === "not_configured") return done("not_configured");
      await audit(err.category);
      throw err; // fixed safe message/code; errorHandler renders the standard envelope
    }
    await audit("unexpected_error");
    throw err;
  }

  const dto = kycDtoSchema.safeParse(normalized);
  if (!dto.success) {
    // The adapter produced something outside the allow-list shape: treat as a bad provider response.
    await audit("malformed_response");
    throw new AppError("PROVIDER_BAD_RESPONSE", "The payment provider returned an unexpected response.", 502);
  }
  return done("available", dto.data);
};
