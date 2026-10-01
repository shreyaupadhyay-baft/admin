import { z } from "zod";

export const campaignTypeSchema = z.enum(["promotional", "referral", "retention", "reengagement", "other"]);
export const campaignStatusSchema = z.enum(["draft", "scheduled", "active", "completed", "cancelled"]);

// Deliberately a plain structured object, not a rule-engine DSL — evolves
// without schema changes, per the "no over-engineered rule engine" guidance.
const jsonDefinitionSchema = z.record(z.string(), z.unknown()).optional().default({});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  campaignType: campaignTypeSchema,
  audienceDefinition: jsonDefinitionSchema,
  targetingDefinition: jsonDefinitionSchema,
});

// No `status` field here on purpose — lifecycle transitions only happen
// through the dedicated schedule/activate/complete/cancel endpoints.
export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    campaignType: campaignTypeSchema.optional(),
    audienceDefinition: z.record(z.string(), z.unknown()).optional(),
    targetingDefinition: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const scheduleCampaignSchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date().optional(),
  })
  .refine((data) => data.endAt === undefined || data.endAt > data.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export const listCampaignsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: campaignStatusSchema.optional(),
  campaignType: campaignTypeSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
