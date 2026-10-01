import { z } from "zod";
import { riskCategorySchema, riskSeveritySchema } from "./riskSignal.schema.js";

export { riskCategorySchema, riskSeveritySchema };

export const riskCaseNonTerminalStatusSchema = z.enum(["open", "triaged", "investigating"]);
export const riskCaseStatusSchema = z.enum(["open", "triaged", "investigating", "resolved", "closed"]);
export const riskCaseDecisionSchema = z.enum(["no_action", "monitor", "restrict_account", "escalate", "close_case"]);
export const riskEvidenceTypeSchema = z.enum([
  "risk_signal",
  "provider_signal",
  "device_signal",
  "system_signal",
  "security_event",
  "behavioral_signal",
  "manual_note",
  "external_reference",
]);

export const createRiskCaseSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  category: riskCategorySchema,
  severity: riskSeveritySchema.optional().default("medium"),
  userId: z.string().uuid().optional(),
  summary: z.string().trim().max(5000).optional().default(""),
  source: z.string().trim().min(1).max(100).optional().default("manual"),
});

export const updateRiskCaseSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(5000).optional(),
    category: riskCategorySchema.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const assignRiskCaseSchema = z.object({
  adminId: z.string().uuid("adminId must be a valid uuid").nullable(),
});

export const updateRiskCaseStatusSchema = z.object({
  status: riskCaseNonTerminalStatusSchema,
  reason: z.string().trim().max(2000).optional(),
});

export const updateRiskCaseSeveritySchema = z.object({
  severity: riskSeveritySchema,
  reason: z.string().trim().max(2000).optional(),
});

export const resolveRiskCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const closeRiskCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const addRiskCaseNoteSchema = z.object({
  note: z.string().trim().min(1, "note is required").max(2000),
});

export const addRiskCaseEvidenceSchema = z.object({
  evidenceType: riskEvidenceTypeSchema,
  source: z.string().trim().min(1, "source is required").max(100),
  externalReference: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1, "description is required").max(2000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const addRiskCaseDecisionSchema = z.object({
  decision: riskCaseDecisionSchema,
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const listRiskCasesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: riskCaseStatusSchema.optional(),
  severity: riskSeveritySchema.optional(),
  category: riskCategorySchema.optional(),
  assignedAdminId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
