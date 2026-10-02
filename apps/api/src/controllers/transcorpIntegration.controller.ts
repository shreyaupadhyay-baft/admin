import type { Request, Response } from "express";
import { getTranscorpConfigResult } from "../integrations/transcorp/config.js";
import { getTranscorpHealth } from "../integrations/transcorp/health.service.js";
import { processWebhook, RedisReplayStore, type ReplayStore } from "../integrations/transcorp/webhook/gateway.js";
import { logWithContext } from "../utils/logger.js";
import { sendError, sendSuccess } from "../utils/response.js";

/**
 * Always 200: this endpoint reports on the provider; a provider outage is a
 * normal answer here, not a BAFT Admin failure. Reveals no credentials —
 * only non-secret settings and config *error messages* (names, never values).
 */
export const getTranscorpHealthHandler = async (req: Request, res: Response) => {
  const report = await getTranscorpHealth({ requestId: req.requestId, correlationId: req.correlationId });
  sendSuccess(res, 200, report, { request_id: req.requestId });
};

let replayStore: ReplayStore | undefined;
export const setReplayStoreForTesting = (store: ReplayStore | undefined) => {
  replayStore = store;
};

/**
 * Webhook boundary. Authentication is the provider token (not an admin
 * session). Responses are intentionally terse and never echo the payload.
 */
export const receiveTranscorpWebhookHandler = async (req: Request, res: Response) => {
  const configResult = getTranscorpConfigResult();
  const outcome = await processWebhook(
    {
      config: configResult.status === "ready" ? configResult.config : undefined,
      replayStore: replayStore ?? (replayStore = new RedisReplayStore()),
    },
    req.headers,
    req.body,
    { requestId: req.requestId, correlationId: req.correlationId },
  );

  logWithContext(outcome.kind === "accepted" || outcome.kind === "duplicate" ? "info" : "warn", "transcorp_webhook", {
    requestId: req.requestId,
    correlationId: req.correlationId,
    outcome: outcome.kind,
  });

  switch (outcome.kind) {
    case "accepted":
      sendSuccess(res, 202, { status: "accepted" }, { request_id: req.requestId });
      return;
    case "duplicate":
      sendSuccess(res, 200, { status: "duplicate_ignored" }, { request_id: req.requestId });
      return;
    case "unauthorized":
      sendError(res, req.requestId, 401, "WEBHOOK_UNAUTHORIZED", "Webhook authentication failed.");
      return;
    case "invalid_payload":
      sendError(res, req.requestId, 400, "WEBHOOK_INVALID_PAYLOAD", "Webhook payload is invalid.");
      return;
    case "not_configured":
      sendError(res, req.requestId, 503, "WEBHOOK_NOT_CONFIGURED", "Webhook receiver is not configured.");
      return;
    case "store_unavailable":
    case "handler_failed":
      // 5xx so the provider retries; the replay claim was released/never taken.
      sendError(res, req.requestId, 503, "WEBHOOK_TEMPORARILY_UNAVAILABLE", "Webhook could not be processed. Please retry.");
      return;
  }
};
