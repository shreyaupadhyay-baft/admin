import type { Request, Response } from "express";
import * as analytics from "../services/analytics.service.js";
import { AppError, sendSuccess } from "../utils/response.js";
import { RangeError_, rangeQuerySchema, resolveRange, type ResolvedRange } from "../utils/dateRange.js";

/** Strict: unknown query parameters (dimensions, columns, group-bys) are rejected, not ignored. */
const parseRange = (req: Request): ResolvedRange => {
  const parsed = rangeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join("; "), 400);
  }
  try {
    return resolveRange(parsed.data);
  } catch (err) {
    if (err instanceof RangeError_) throw new AppError("VALIDATION_ERROR", err.message, 400);
    throw err;
  }
};

const respond = (res: Response, req: Request, body: analytics.AnalyticsSection) => {
  res.setHeader("Cache-Control", "no-store");
  sendSuccess(res, 200, body, { request_id: req.requestId });
};

export const getOverviewHandler = async (req: Request, res: Response) =>
  respond(res, req, await analytics.getOverview(parseRange(req), req.admin?.permissions ?? []));
export const getOnboardingHandler = async (req: Request, res: Response) => respond(res, req, await analytics.getOnboarding(parseRange(req)));
export const getFeaturesHandler = async (req: Request, res: Response) => respond(res, req, analytics.getFeatureUsage(parseRange(req)));
export const getRetentionHandler = async (req: Request, res: Response) => respond(res, req, analytics.getRetention(parseRange(req)));
export const getUsageHandler = async (req: Request, res: Response) => respond(res, req, await analytics.getUsage(parseRange(req)));
export const getRewardsHandler = async (req: Request, res: Response) => respond(res, req, await analytics.getRewardsAnalytics(parseRange(req)));
export const getFinancialHandler = async (req: Request, res: Response) => respond(res, req, analytics.getFinancial(parseRange(req)));
