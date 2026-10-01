import { z } from "zod";

export const supportCaseCategorySchema = z.enum(["account", "technical", "app_issue", "other"]);
export const supportCasePrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
// Only the two non-terminal states are reachable through the generic update
// endpoint — 'resolved'/'closed' only happen through their dedicated,
// separately-permissioned endpoints (which also stamp resolved_at/closed_at).
export const supportCaseNonTerminalStatusSchema = z.enum(["open", "in_progress"]);

export const createSupportCaseSchema = z.object({
  userId: z.string().uuid("userId must be a valid uuid"),
  subject: z.string().trim().min(1, "subject is required").max(200),
  description: z.string().trim().min(1, "description is required").max(5000),
  category: supportCaseCategorySchema,
  priority: supportCasePrioritySchema.optional().default("medium"),
});

export const updateSupportCaseSchema = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    category: supportCaseCategorySchema.optional(),
    priority: supportCasePrioritySchema.optional(),
    status: supportCaseNonTerminalStatusSchema.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "at least one field must be provided",
  });

export const assignSupportCaseSchema = z.object({
  adminId: z.string().uuid("adminId must be a valid uuid").nullable(),
});

export const resolveSupportCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const closeSupportCaseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const addSupportCaseNoteSchema = z.object({
  note: z.string().trim().min(1, "note is required").max(2000),
});

export const listSupportCasesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  category: supportCaseCategorySchema.optional(),
  priority: supportCasePrioritySchema.optional(),
  assignedAdminId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});
