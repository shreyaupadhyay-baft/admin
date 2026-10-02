import { z } from "zod";
import type { TranscorpHost } from "../config.js";
import { assertSafePath, defineOperation } from "./types.js";

/**
 * Connectivity probe. The Transcorp health/ping endpoint is NOT confirmed, so
 * the path/host come from TRANSCORP_HEALTH_PATH / TRANSCORP_HEALTH_HOST. If
 * unset, no probe operation exists and health reports "unverified".
 *
 * The response schema accepts any JSON (or an empty body): we only care that
 * the provider answered 2xx with a well-formed body, never what is in it.
 */
export const createHealthProbeOperation = (host: TranscorpHost, path: string) => {
  assertSafePath(path);
  return defineOperation<void, undefined, unknown>({
    name: "system.healthProbe",
    host,
    method: "GET",
    kind: "read",
    idempotency: "none",
    maxAttempts: 1, // a probe must report the truth quickly, not mask flakiness with retries
    path: () => path,
    responseSchema: z.unknown(),
  });
};
