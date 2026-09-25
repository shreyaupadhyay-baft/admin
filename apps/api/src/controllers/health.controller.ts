import type { Request, Response } from "express";
import { checkDatabaseHealth } from "../infrastructure/database/pool.js";
import { checkRedisHealth } from "../infrastructure/redis/client.js";
import { sendSuccess } from "../utils/response.js";

/** Liveness: process is up. Must never depend on external services. */
export const getLiveness = (_req: Request, res: Response) => {
  sendSuccess(res, 200, { status: "ok" });
};

/** Readiness: process is up AND its hard dependencies are reachable. */
export const getReadiness = async (req: Request, res: Response) => {
  const [databaseHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const dependencies = {
    database: databaseHealthy ? "up" : "down",
    redis: redisHealthy ? "up" : "down",
  };

  const isReady = databaseHealthy && redisHealthy;

  sendSuccess(res, isReady ? 200 : 503, { status: isReady ? "ok" : "degraded", dependencies }, {
    request_id: req.requestId,
  });
};
