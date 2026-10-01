import { z } from "zod";

export const appIssueSourceSchema = z.enum(["IN_APP", "USER_REPORTED"]);
export const appIssueSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
// 'resolved' is only reachable through the dedicated resolve endpoint.
export const appIssueNonTerminalStatusSchema = z.enum(["open", "in_progress"]);

export const createAppIssueSchema = z.object({
  userId: z.string().uuid("userId must be a valid uuid").optional(),
  source: appIssueSourceSchema,
  title: z.string().trim().min(1, "title is required").max(200),
  description: z.string().trim().min(1, "description is required").max(5000),
  severity: appIssueSeveritySchema.optional().default("medium"),
});

export const updateAppIssueSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    severity: appIssueSeveritySchema.optional(),
    status: appIssueNonTerminalStatusSchema.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const assignAppIssueSchema = z.object({
  adminId: z.string().uuid("adminId must be a valid uuid").nullable(),
});

export const listAppIssuesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  source: appIssueSourceSchema.optional(),
  severity: appIssueSeveritySchema.optional(),
  assignedAdminId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});
