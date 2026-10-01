import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/response.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { generateOpaqueToken, hashToken } from "./token.service.js";
import { findAdminUserByEmail, findAdminUserById, type AdminUserRow } from "../repositories/adminUser.repository.js";
import { listRolesForAdmin, listPermissionKeysForAdmin } from "../repositories/rbac.repository.js";
import {
  createSession,
  findActiveSessionByAccessTokenHash,
  findActiveSessionByRefreshTokenHash,
  rotateSession,
  revokeSession,
} from "../repositories/session.repository.js";
import type { AuthenticatedAdmin } from "../types/rbac.js";

// A dummy hash comparison runs when the email doesn't exist, so login takes
// roughly the same time whether or not the account is real (timing-based
// user enumeration defense). Computed once and cached.
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
};

const invalidCredentialsError = () => new AppError("INVALID_CREDENTIALS", "Invalid email or password.", 401);

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60_000);

const toPrincipal = async (user: AdminUserRow, sessionId: string): Promise<AuthenticatedAdmin> => {
  const [roles, permissions] = await Promise.all([
    listRolesForAdmin(user.id),
    listPermissionKeysForAdmin(user.id),
  ]);

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    isActive: user.is_active,
    sessionId,
    roles: roles.map((r) => r.name),
    permissions,
  };
};

export type LoginResult = {
  admin: AuthenticatedAdmin;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export const login = async (params: {
  email: string;
  password: string;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<LoginResult> => {
  const user = await findAdminUserByEmail(params.email);

  if (!user) {
    await verifyPassword(params.password, await getDummyHash());
    throw invalidCredentialsError();
  }

  const passwordValid = await verifyPassword(params.password, user.password_hash);
  if (!passwordValid) {
    throw invalidCredentialsError();
  }

  if (!user.is_active) {
    throw new AppError("ACCOUNT_DISABLED", "This admin account has been disabled.", 403);
  }

  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const accessExpiresAt = minutesFromNow(env.ACCESS_TOKEN_TTL_MINUTES);
  const refreshExpiresAt = daysFromNow(env.REFRESH_TOKEN_TTL_DAYS);

  const session = await createSession({
    adminUserId: user.id,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    accessExpiresAt,
    refreshExpiresAt,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  const admin = await toPrincipal(user, session.id);

  return { admin, accessToken, accessExpiresAt, refreshToken, refreshExpiresAt };
};

export const loadPrincipalFromAccessToken = async (accessToken: string): Promise<AuthenticatedAdmin | null> => {
  const session = await findActiveSessionByAccessTokenHash(hashToken(accessToken));
  if (!session) return null;

  const user = await findAdminUserById(session.admin_user_id);
  if (!user || !user.is_active) return null;

  return toPrincipal(user, session.id);
};

export type RefreshResult = {
  admin: AuthenticatedAdmin;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export const refresh = async (refreshTokenValue: string): Promise<RefreshResult> => {
  const invalidSessionError = () => new AppError("INVALID_SESSION", "Session is invalid or has expired.", 401);

  const session = await findActiveSessionByRefreshTokenHash(hashToken(refreshTokenValue));
  if (!session) {
    throw invalidSessionError();
  }

  const user = await findAdminUserById(session.admin_user_id);
  if (!user || !user.is_active) {
    throw invalidSessionError();
  }

  const newAccessToken = generateOpaqueToken();
  const newRefreshToken = generateOpaqueToken();
  const accessExpiresAt = minutesFromNow(env.ACCESS_TOKEN_TTL_MINUTES);

  const rotated = await rotateSession({
    sessionId: session.id,
    accessTokenHash: hashToken(newAccessToken),
    refreshTokenHash: hashToken(newRefreshToken),
    accessExpiresAt,
  });

  if (!rotated) {
    throw invalidSessionError();
  }

  const admin = await toPrincipal(user, session.id);

  return {
    admin,
    accessToken: newAccessToken,
    accessExpiresAt,
    refreshToken: newRefreshToken,
    refreshExpiresAt: session.refresh_expires_at,
  };
};

export const logout = async (sessionId: string): Promise<void> => {
  await revokeSession(sessionId);
};

// Logout is intentionally forgiving: it tries the access token, falls back to
// the refresh token, and never errors if neither resolves to a live session
// (the caller is already logged out from the client's point of view either way).
export const resolveSessionForLogout = async (
  accessToken: string | null,
  refreshTokenValue: string | null,
): Promise<{ sessionId: string; adminId: string } | null> => {
  if (accessToken) {
    const session = await findActiveSessionByAccessTokenHash(hashToken(accessToken));
    if (session) return { sessionId: session.id, adminId: session.admin_user_id };
  }

  if (refreshTokenValue) {
    const session = await findActiveSessionByRefreshTokenHash(hashToken(refreshTokenValue));
    if (session) return { sessionId: session.id, adminId: session.admin_user_id };
  }

  return null;
};
