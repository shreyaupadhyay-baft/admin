import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required and cannot be empty or whitespace-only").max(200),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
