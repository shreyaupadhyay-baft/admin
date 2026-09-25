import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * Every request gets its own requestId. correlationId is propagated from an
 * upstream caller when present (so a chain of calls can be traced end to
 * end), otherwise it starts a new correlation chain here.
 */
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incomingCorrelationId = req.header(CORRELATION_ID_HEADER);

  req.requestId = randomUUID();
  req.correlationId = incomingCorrelationId && incomingCorrelationId.trim().length > 0
    ? incomingCorrelationId
    : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  res.setHeader(CORRELATION_ID_HEADER, req.correlationId);

  next();
};
