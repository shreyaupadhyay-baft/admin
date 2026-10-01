import type { Request, Response } from "express";
import { sendSuccess } from "../utils/response.js";
import { countActiveCriticalSecurityCases, countActiveSecurityCases } from "../repositories/securityCase.repository.js";
import { countSecurityEventsBySeverities, listRecentSecurityEvents } from "../repositories/securityEvent.repository.js";
import { countUsersBySecurityStatus } from "../repositories/user.repository.js";
import { countPendingSecurityActions } from "../repositories/securityAction.repository.js";

// A concise Admin overview, not a SIEM: a handful of current counts plus the
// most recent events. "Recent"/"high severity" windows to the last 7 days so
// the numbers reflect current posture rather than growing unbounded forever.
const RECENT_WINDOW_DAYS = 7;
const RECENT_EVENTS_LIMIT = 10;

export const getSecurityPostureHandler = async (_req: Request, res: Response): Promise<void> => {
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [activeSecurityCases, criticalSecurityCases, highSeverityEvents, blockedUsers, pendingSecurityActions, recentEvents] =
    await Promise.all([
      countActiveSecurityCases(),
      countActiveCriticalSecurityCases(),
      countSecurityEventsBySeverities(["high", "critical"], since),
      countUsersBySecurityStatus("blocked"),
      countPendingSecurityActions(),
      listRecentSecurityEvents(RECENT_EVENTS_LIMIT),
    ]);

  sendSuccess(res, 200, {
    posture: {
      activeSecurityCases,
      criticalSecurityCases,
      highSeverityEvents,
      blockedUsers,
      pendingSecurityActions,
      recentSecurityEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        category: e.category,
        severity: e.severity,
        detectedAt: e.detected_at,
      })),
    },
  });
};
