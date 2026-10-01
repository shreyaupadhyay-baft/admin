import { z } from "zod";

export const deviceStatusSchema = z.enum(["active", "inactive", "blocked"]);

// userId (relink) and status are gated by different permissions in the
// controller (devices.update vs. devices.status.update) since they map to
// the two distinct IA sub-items: Linked User and Status.
export const updateDeviceSchema = z
  .object({
    userId: z.string().uuid("userId must be a valid uuid").optional(),
    status: deviceStatusSchema.optional(),
  })
  .refine((data) => data.userId !== undefined || data.status !== undefined, {
    message: "at least one of userId or status must be provided",
  });

export const listDevicesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: deviceStatusSchema.optional(),
  userId: z.string().uuid().optional(),
});
