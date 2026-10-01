import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100),
  description: z.string().trim().max(500).optional().default(""),
  permissionIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    permissionIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined || data.permissionIds !== undefined,
    { message: "at least one of name, description, or permissionIds must be provided" },
  );
