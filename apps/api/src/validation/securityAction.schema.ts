import { z } from "zod";

export const securityActionTypeSchema = z.enum(["block_user", "unblock_user", "force_logout", "revoke_sessions"]);
export const securityActionStatusSchema = z.enum(["requested", "approved", "rejected", "executed"]);

export const requestBlockSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const requestUnblockSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const rejectSecurityActionSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

export const forceLogoutSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const revokeSessionsSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const listSecurityActionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: securityActionStatusSchema.optional(),
  actionType: securityActionTypeSchema.optional(),
  userId: z.string().uuid().optional(),
});
