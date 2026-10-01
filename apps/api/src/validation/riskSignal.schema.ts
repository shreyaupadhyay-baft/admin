import { z } from "zod";

export const riskCategorySchema = z.enum([
  "account_identity",
  "authentication_security",
  "fraud",
  "transaction_payment",
  "device",
  "behavioral",
  "integration_provider",
  "operational",
  "system_technical",
  "privacy_data",
  "ai_model",
]);

export const riskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const riskSignalStatusSchema = z.enum(["new", "acknowledged", "dismissed", "escalated"]);

const jsonMetadataSchema = z.record(z.string(), z.unknown()).optional().default({});

export const createRiskSignalSchema = z.object({
  signalType: z.string().trim().min(1, "signalType is required").max(100),
  category: riskCategorySchema,
  severity: riskSeveritySchema.optional().default("medium"),
  source: z.string().trim().min(1, "source is required").max(100),
  userId: z.string().uuid().optional(),
  externalReference: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1, "description is required").max(5000),
  metadata: jsonMetadataSchema,
  detectedAt: z.coerce.date().optional(),
});

export const updateRiskSignalStatusSchema = z.object({
  status: riskSignalStatusSchema,
  reason: z.string().trim().max(2000).optional(),
});

export const listRiskSignalsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  category: riskCategorySchema.optional(),
  severity: riskSeveritySchema.optional(),
  status: riskSignalStatusSchema.optional(),
  source: z.string().trim().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
  detectedFrom: z.coerce.date().optional(),
  detectedTo: z.coerce.date().optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
});
