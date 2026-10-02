import { getTranscorpClient, type RequestContext, type TranscorpClient } from "./client.js";
import { getTranscorpConfigResult, summarizeSettings, type TranscorpConfigResult } from "./config.js";
import { isTranscorpProviderError } from "./errors.js";
import { createHealthProbeOperation } from "./operations/health.js";

/**
 * Provider health. Deliberately NOT part of /health/ready: a Transcorp outage
 * must never make BAFT Admin's own readiness fail or block unrelated modules.
 */
export type TranscorpHealthStatus =
  | "disabled" // TRANSCORP_ENABLED is not true
  | "misconfigured" // enabled, but config failed validation (see configErrors — names only, no values)
  | "unverified" // config is valid but no probe endpoint is configured (TBD with Transcorp)
  | "healthy"
  | "unhealthy";

export interface TranscorpHealthReport {
  provider: "transcorp";
  status: TranscorpHealthStatus;
  checkedAt: string;
  environment?: string;
  authMode?: string;
  latencyMs?: number;
  failureCategory?: string;
  configErrors?: string[];
  circuit?: { state: string; consecutiveFailures: number };
  settings?: ReturnType<typeof summarizeSettings>;
}

const CACHE_TTL_MS = 10_000;

export interface HealthDeps {
  getConfigResult?: () => TranscorpConfigResult;
  getClient?: () => TranscorpClient;
  now?: () => number;
}

let cache: { at: number; report: TranscorpHealthReport } | undefined;
let inflight: Promise<TranscorpHealthReport> | undefined;

export const resetTranscorpHealthCache = () => {
  cache = undefined;
  inflight = undefined;
};

/**
 * Results are cached briefly and concurrent callers share one probe, so the
 * health endpoint cannot be used to hammer the provider.
 */
export const getTranscorpHealth = async (
  ctx: RequestContext = {},
  deps: HealthDeps = {},
  options: { force?: boolean } = {},
): Promise<TranscorpHealthReport> => {
  const now = deps.now ?? Date.now;
  if (!options.force && cache && now() - cache.at < CACHE_TTL_MS) return cache.report;
  if (inflight) return inflight;

  inflight = computeHealth(ctx, deps)
    .then((report) => {
      cache = { at: now(), report };
      return report;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
};

const computeHealth = async (ctx: RequestContext, deps: HealthDeps): Promise<TranscorpHealthReport> => {
  const result = (deps.getConfigResult ?? getTranscorpConfigResult)();
  const checkedAt = new Date().toISOString();

  if (result.status === "disabled") return { provider: "transcorp", status: "disabled", checkedAt };
  if (result.status === "invalid") {
    return { provider: "transcorp", status: "misconfigured", checkedAt, configErrors: result.errors };
  }

  const { settings } = result.config;
  const base = {
    provider: "transcorp" as const,
    checkedAt,
    environment: settings.environment,
    authMode: settings.authMode,
    settings: summarizeSettings(settings),
  };

  if (!settings.healthProbe) return { ...base, status: "unverified" };

  const client = (deps.getClient ?? getTranscorpClient)();
  const probe = createHealthProbeOperation(settings.healthProbe.host, settings.healthProbe.path);
  const started = Date.now();
  try {
    await client.execute(probe, {}, ctx);
    return { ...base, status: "healthy", latencyMs: Date.now() - started, circuit: client.circuit };
  } catch (err) {
    return {
      ...base,
      status: "unhealthy",
      latencyMs: Date.now() - started,
      failureCategory: isTranscorpProviderError(err) ? err.category : "network",
      circuit: client.circuit,
    };
  }
};
