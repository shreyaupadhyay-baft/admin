import { z } from "zod";
import { securityCategorySchema, securitySeveritySchema } from "./securityEvent.schema.js";

export { securityCategorySchema, securitySeveritySchema };

export const securityCaseNonTerminalStatusSchema = z.enum(["open", "triaged", "investigating"]);
export const securityCaseStatusSchema = z.enum(["open", "triaged", "investigating", "resolved", "closed"]);
export const securityEvidenceTypeSchema = z.enum([
  "security_event",
  "device_signal",
  "authentication_event",
  "configuration_event",
  "system_signal",
  "provider_signal",
  "manual_note",
  "external_reference",
]);

export const createSecurityCaseSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  category: securityCategorySchema,
  severity: securitySeveritySchema.optional().default("medium"),
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  summary: z.string().trim().max(5000).optional().default(""),
  source: z.string().trim().min(1).max(100).optional().default("manual"),
});

export const updateSecurityCaseSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(5000).optional(),
    category: securityCategorySchema.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const assignSecurityCaseSchema = z.object({
  adminId: z.string().uuid("adminId must be a valid uuid").nullable(),
});

export const updateSecurityCaseStatusSchema = z.object({
  status: securityCaseNonTerminalStatusSchema,
  reason: z.string().trim().max(2000).optional(),
});

export const updateSecurityCaseSeveritySchema = z.object({
  severity: securitySeveritySchema,
  reason: z.string().trim().max(2000).optional(),
});

export const resolveSecurityCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const closeSecurityCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const addSecurityCaseNoteSchema = z.object({
  note: z.string().trim().min(1, "note is required").max(2000),
});

export const addSecurityCaseEvidenceSchema = z.object({
  evidenceType: securityEvidenceTypeSchema,
  source: z.string().trim().min(1, "source is required").max(100),
  externalReference: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1, "description is required").max(2000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const listSecurityCasesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: securityCaseStatusSchema.optional(),
  severity: securitySeveritySchema.optional(),
  category: securityCategorySchema.optional(),
  assignedAdminId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
