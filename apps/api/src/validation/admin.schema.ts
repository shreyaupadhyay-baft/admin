import { z } from "zod";

const passwordPolicy = z
  .string()
  .min(12, "password must be at least 12 characters")
  .max(256, "password must be at most 256 characters");

export const createAdminSchema = z.object({
  email: z.string().trim().min(1, "email is required").email("email must be valid"),
  password: passwordPolicy,
  fullName: z.string().trim().min(1, "fullName is required").max(200),
  roleIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateAdminSchema = z
  .object({
    email: z.string().trim().min(1).email("email must be valid").optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => data.email !== undefined || data.fullName !== undefined, {
    message: "at least one of email or fullName must be provided",
  });

export const assignRoleSchema = z.object({
  roleId: z.string().uuid("roleId must be a valid uuid"),
});
