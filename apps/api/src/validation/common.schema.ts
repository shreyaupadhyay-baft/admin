import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().uuid("id must be a valid uuid"),
});

export const adminRoleParamSchema = z.object({
  id: z.string().uuid("id must be a valid uuid"),
  roleId: z.string().uuid("roleId must be a valid uuid"),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid("userId must be a valid uuid"),
});
