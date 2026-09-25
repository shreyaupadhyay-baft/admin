import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logWithContext } from "../../utils/logger.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

redis.on("error", (err: Error) => {
  logWithContext("error", "redis_client_error", { error: { message: err.message } });
});

let hasConnected = false;

export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!hasConnected) {
      await redis.connect();
      hasConnected = true;
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    logWithContext("error", "redis_health_check_failed", {
      error: err instanceof Error ? { message: err.message } : err,
    });
    return false;
  }
};
