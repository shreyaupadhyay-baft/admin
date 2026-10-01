import { z } from "zod";

export const rewardTypeSchema = z.enum(["cashback", "points", "voucher", "fee_waiver", "bonus"]);
export const rewardStatusSchema = z.enum(["draft", "active", "paused", "expired", "cancelled"]);

const jsonDefinitionSchema = z.record(z.string(), z.unknown()).optional().default({});

export const createRewardSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  rewardType: rewardTypeSchema,
  ruleDefinition: jsonDefinitionSchema,
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
});

// No `status` field on purpose — lifecycle transitions only happen through
// the dedicated activate/pause/resume/expire/cancel endpoints.
export const updateRewardSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    rewardType: rewardTypeSchema.optional(),
    ruleDefinition: z.record(z.string(), z.unknown()).optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const listRewardsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: rewardStatusSchema.optional(),
  rewardType: rewardTypeSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});

export const entitlementQuerySchema = z.object({
  userId: z.string().uuid("userId must be a valid uuid"),
});
