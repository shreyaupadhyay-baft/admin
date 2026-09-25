import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
  CORS_ALLOWED_ORIGINS: z.string().min(1, "CORS_ALLOWED_ORIGINS is required"),

  // Transcorp integration: intentionally optional at Phase 0. The domain
  // services that call TranscorpIntegrationService do not exist yet; when
  // they land, that service must fail closed if these are unset outside dev.
  TRANSCORP_KYC_BASE_URL: z.string().optional(),
  TRANSCORP_BASE_URL: z.string().optional(),
  TRANSCORP_TENANT: z.string().optional(),
  TRANSCORP_PARTNER_ID: z.string().optional(),
  TRANSCORP_PARTNER_TOKEN: z.string().optional(),
  TRANSCORP_AUTH_TOKEN: z.string().optional(),
  TRANSCORP_WEBHOOK_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed. See details above.");
}

export const env = parsed.data;

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
