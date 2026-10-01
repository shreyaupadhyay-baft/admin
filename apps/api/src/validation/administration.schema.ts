import { z } from "zod";

// Query-string booleans arrive as strings; z.coerce.boolean() would treat the
// literal string "false" as truthy (JS Boolean("false") === true), so this
// spells it out explicitly instead.
const booleanQueryParam = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

const adminSortSchema = z
  .enum(["created_at_desc", "created_at_asc", "full_name_asc", "full_name_desc", "email_asc", "email_desc"])
  .optional()
  .default("created_at_desc");

export const listAdministrationAdminsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  isActive: booleanQueryParam,
  roleId: z.string().uuid().optional(),
  sort: adminSortSchema,
});

export const listAdminSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listAdministrationRolesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  isActive: booleanQueryParam,
});

// Metadata only — permission changes go through PUT .../permissions instead,
// per the spec's explicit split (generic PATCH must never touch permissions).
export const updateAdministrationRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "at least one of name or description must be provided",
  });

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).max(500),
});

export const listAdministrationPermissionsQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  resource: z.string().trim().min(1).max(100).optional(),
});

export const listAdministrationAuditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  actorAdminId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  targetType: z.string().trim().min(1).max(100).optional(),
  targetId: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
