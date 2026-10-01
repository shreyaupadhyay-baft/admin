import { z } from "zod";

export const userStatusSchema = z.enum(["active", "suspended", "disabled"]);

export const createUserSchema = z.object({
  email: z.string().trim().min(1, "email is required").email("email must be valid"),
  phoneNumber: z.string().trim().min(1).max(32).optional(),
  fullName: z.string().trim().min(1, "fullName is required").max(200),
  externalRef: z.string().trim().min(1).max(200).optional(),
});

export const updateUserSchema = z
  .object({
    email: z.string().trim().min(1).email("email must be valid").optional(),
    phoneNumber: z.string().trim().min(1).max(32).optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => data.email !== undefined || data.phoneNumber !== undefined || data.fullName !== undefined, {
    message: "at least one of email, phoneNumber, or fullName must be provided",
  });

export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: userStatusSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
