import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
  CORS_ALLOWED_ORIGINS: z.string().min(1, "CORS_ALLOWED_ORIGINS is required"),

  // ── Admin auth session policy ──────────────────────────────────────────
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  // Used only by the db:seed:admin script to bootstrap the first Super Admin.
  // Never used by the running API itself.
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_FULL_NAME: z.string().optional(),

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
