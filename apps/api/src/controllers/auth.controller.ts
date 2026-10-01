import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, clearAuthCookies, readCookie, setAccessTokenCookie, setRefreshTokenCookie } from "../utils/cookies.js";
import { login, logout, refresh, resolveSessionForLogout } from "../services/auth.service.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import type { AuthenticatedAdmin } from "../types/rbac.js";

const serializeAdmin = (admin: AuthenticatedAdmin) => ({
  id: admin.id,
  email: admin.email,
  fullName: admin.fullName,
  roles: admin.roles,
  permissions: admin.permissions,
});

export const loginHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };
  const userAgent = req.headers["user-agent"] ?? null;
  const ipAddress = req.ip ?? null;

  try {
    const result = await login({ email, password, userAgent, ipAddress });

    setAccessTokenCookie(res, result.accessToken, result.accessExpiresAt);
    setRefreshTokenCookie(res, result.refreshToken, result.refreshExpiresAt);

    await recordAudit(req, AUDIT_ACTIONS.LOGIN_SUCCESS, {
      actorAdminId: result.admin.id,
      targetType: "admin_user",
      targetId: result.admin.id,
    });

    sendSuccess(res, 200, { admin: serializeAdmin(result.admin) });
  } catch (err) {
    await recordAudit(req, AUDIT_ACTIONS.LOGIN_FAILURE, {
      actorAdminId: null,
      targetType: "admin_user",
      metadata: {
        emailAttempted: email,
        reason: err instanceof AppError ? err.code : "unknown_error",
      },
    });
    throw err;
  }
};

export const logoutHandler = async (req: Request, res: Response): Promise<void> => {
  const accessToken = readCookie(req, ACCESS_TOKEN_COOKIE);
  const refreshTokenValue = readCookie(req, REFRESH_TOKEN_COOKIE);

  const resolved = await resolveSessionForLogout(accessToken, refreshTokenValue);
  if (resolved) {
    await logout(resolved.sessionId);
    await recordAudit(req, AUDIT_ACTIONS.LOGOUT, {
      actorAdminId: resolved.adminId,
      targetType: "admin_session",
      targetId: resolved.sessionId,
    });
  }

  clearAuthCookies(res);
  sendSuccess(res, 200, { loggedOut: true });
};

export const refreshHandler = async (req: Request, res: Response): Promise<void> => {
  const refreshTokenValue = readCookie(req, REFRESH_TOKEN_COOKIE);
  if (!refreshTokenValue) {
    throw new AppError("UNAUTHENTICATED", "No active session to refresh.", 401);
  }

  const result = await refresh(refreshTokenValue);

  setAccessTokenCookie(res, result.accessToken, result.accessExpiresAt);
  setRefreshTokenCookie(res, result.refreshToken, result.refreshExpiresAt);

  sendSuccess(res, 200, { admin: serializeAdmin(result.admin) });
};

export const meHandler = (req: Request, res: Response): void => {
  // authenticate middleware guarantees req.admin is set here.
  sendSuccess(res, 200, { admin: serializeAdmin(req.admin as AuthenticatedAdmin) });
};
