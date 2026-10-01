import { z } from "zod";

export const securityCategorySchema = z.enum([
  "authentication",
  "account",
  "device",
  "access",
  "session",
  "api",
  "integration",
  "privacy",
  "configuration",
  "system",
]);

export const securitySeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const securityEventStatusSchema = z.enum(["new", "acknowledged", "dismissed", "escalated"]);

const jsonMetadataSchema = z.record(z.string(), z.unknown()).optional().default({});

export const createSecurityEventSchema = z.object({
  eventType: z.string().trim().min(1, "eventType is required").max(100),
  category: securityCategorySchema,
  severity: securitySeveritySchema.optional().default("medium"),
  source: z.string().trim().min(1, "source is required").max(100),
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  externalReference: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1, "description is required").max(5000),
  metadata: jsonMetadataSchema,
  detectedAt: z.coerce.date().optional(),
});

export const updateSecurityEventStatusSchema = z.object({
  status: securityEventStatusSchema,
  reason: z.string().trim().max(2000).optional(),
});

export const listSecurityEventsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  eventType: z.string().trim().min(1).max(100).optional(),
  category: securityCategorySchema.optional(),
  severity: securitySeveritySchema.optional(),
  status: securityEventStatusSchema.optional(),
  source: z.string().trim().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  detectedFrom: z.coerce.date().optional(),
  detectedTo: z.coerce.date().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
});
