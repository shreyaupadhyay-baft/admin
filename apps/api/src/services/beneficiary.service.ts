import type { Request } from "express";
import { z } from "zod";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { getTranscorpConfigResult } from "../integrations/transcorp/config.js";
import { isTranscorpProviderError } from "../integrations/transcorp/errors.js";
import { getBeneficiaryAdapter } from "../integrations/transcorp/beneficiary/registry.js";
import { BENEFICIARY_STATUSES } from "../integrations/transcorp/beneficiary/types.js";
import { findUserById } from "../repositories/user.repository.js";
import { AppError } from "../utils/response.js";
import { recordAudit } from "./audit.service.js";

const MAX_BENEFICIARIES = 100;

/**
 * Admin-safe beneficiary DTO. This schema is the allow-list: anything not named
 * here is dropped, strings are length-capped, and the result is built fresh
 * (never a pass-through of provider or normalized objects). Raw provider ids,
 * full account numbers and limits are deliberately absent.
 */
const beneficiaryDtoSchema = z.object({
  status: z.enum(BENEFICIARY_STATUSES),
  displayName: z.string().max(120).optional(),
  beneficiaryType: z.string().max(64).optional(),
  maskedReference: z.string().max(64).optional(),
  addedAt: z.string().datetime({ offset: true }).optional(),
});
const beneficiaryListSchema = z.array(beneficiaryDtoSchema).max(MAX_BENEFICIARIES);
export type BeneficiaryDto = z.infer<typeof beneficiaryDtoSchema>;

/** "available" is the only state carrying data; the rest are explicit empty states, not errors. */
export type BeneficiaryLookupState =
  | "available"
  | "no_provider_relationship" // user has no provider linkage (external_ref empty)
  | "not_found" // provider has no beneficiaries for this user
  | "not_configured" // Transcorp integration disabled/invalid
  | "unverified"; // integration configured but the Beneficiary contract/adapter is not yet wired

export interface BeneficiaryLookupResult {
  source: "transcorp";
  state: BeneficiaryLookupState;
  beneficiaries: BeneficiaryDto[];
}

const AUDIT_OPERATION = "beneficiary.list";

/**
 * authorise (route middleware: beneficiaries.read) → resolve BAFT user → resolve
 * the provider identity SERVER-SIDE → provider call via the Transcorp client →
 * validate/minimise → audit. The provider reference never comes from the request
 * and is never returned.
 */
export const lookupBeneficiariesForUser = async (req: Request, userId: string): Promise<BeneficiaryLookupResult> => {
  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);

  const audit = (outcome: string) =>
    recordAudit(req, AUDIT_ACTIONS.BENEFICIARY_VIEWED, {
      actorAdminId: req.admin?.id ?? null,
      targetType: "user",
      targetId: user.id,
      // Minimal investigation metadata only. Never beneficiary data or the provider reference.
      metadata: { operation: AUDIT_OPERATION, provider: "transcorp", outcome },
    });

  const done = async (state: BeneficiaryLookupState, beneficiaries: BeneficiaryDto[] = []): Promise<BeneficiaryLookupResult> => {
    await audit(state);
    return { source: "transcorp", state, beneficiaries };
  };

  const providerRef = user.external_ref?.trim();
  if (!providerRef) return done("no_provider_relationship");

  const config = getTranscorpConfigResult();
  if (config.status !== "ready") return done("not_configured");

  const adapter = getBeneficiaryAdapter();
  if (!adapter) return done("unverified");

  let normalized: unknown;
  try {
    normalized = await adapter.list(providerRef, {
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

  const dto = beneficiaryListSchema.safeParse(normalized);
  if (!dto.success) {
    await audit("malformed_response");
    throw new AppError("PROVIDER_BAD_RESPONSE", "The payment provider returned an unexpected response.", 502);
  }
  return dto.data.length === 0 ? done("not_found") : done("available", dto.data);
};
