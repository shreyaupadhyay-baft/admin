import { z } from "zod";

export const approvalStatusSchema = z.enum(["requested", "approved", "rejected", "cancelled", "expired"]);

export const createApprovalSchema = z.object({
  actionType: z.string().trim().min(1, "actionType is required").max(100),
  resourceType: z.string().trim().min(1, "resourceType is required").max(100),
  resourceId: z.string().trim().min(1, "resourceId is required").max(200),
  reason: z.string().trim().min(1, "reason is required").max(2000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export const rejectApprovalSchema = z.object({
  reason: z.string().trim().min(1, "reason is required").max(2000),
});

export const listApprovalsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: approvalStatusSchema.optional(),
  actionType: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(100).optional(),
  requestedBy: z.string().uuid().optional(),
  approverAdminId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
});
