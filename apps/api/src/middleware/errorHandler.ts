import type { NextFunction, Request, Response } from "express";
import { logWithContext } from "../utils/logger.js";
import { AppError, sendError } from "../utils/response.js";

export const notFoundHandler = (req: Request, res: Response) => {
  sendError(res, req.requestId, 404, "NOT_FOUND", `No route matches ${req.method} ${req.originalUrl}`);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    sendError(res, req.requestId, err.status, err.code, err.message);
    return;
  }

  logWithContext("error", "unhandled_error", {
    requestId: req.requestId,
    correlationId: req.correlationId,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });

  // Never leak internal stack traces or raw error messages to clients.
  sendError(res, req.requestId, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
