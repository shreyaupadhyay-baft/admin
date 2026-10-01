import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import type { Permission } from "../constants/permissions.js";

/**
 * Throws 401/403 (and audits denials). Exposed standalone, not just as
 * middleware, for endpoints where the required permission depends on which
 * fields are in the request body (see device.controller.ts's PATCH handler,
 * which needs devices.update for a relink vs. devices.status.update for a
 * status change on the same route).
 */
export const assertPermission = async (req: Request, permission: Permission): Promise<void> => {
  if (!req.admin) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required.", 401);
  }

  if (!req.admin.permissions.includes(permission)) {
    await recordAudit(req, AUDIT_ACTIONS.AUTHORIZATION_DENIED, {
      actorAdminId: req.admin.id,
      targetType: "permission",
      targetId: permission,
      metadata: { path: req.originalUrl, method: req.method },
    });
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.", 403);
  }
};

/** Must run after `authenticate`. The backend is authoritative — the frontend's `can()` is UX only. */
export const requirePermission = (permission: Permission) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await assertPermission(req, permission);
      next();
    } catch (err) {
      next(err);
    }
  };
};
