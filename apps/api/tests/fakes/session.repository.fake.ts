import { randomUUID } from "node:crypto";
import { db, type FakeSession } from "./store.js";

export const createSession = async (params: {
  adminUserId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<FakeSession> => {
  const row: FakeSession = {
    id: randomUUID(),
    admin_user_id: params.adminUserId,
    access_token_hash: params.accessTokenHash,
    refresh_token_hash: params.refreshTokenHash,
    user_agent: params.userAgent,
    ip_address: params.ipAddress,
    access_expires_at: params.accessExpiresAt,
    refresh_expires_at: params.refreshExpiresAt,
    revoked_at: null,
    created_at: new Date(),
  };
  db.sessions.push(row);
  return row;
};

export const findActiveSessionByAccessTokenHash = async (hash: string): Promise<FakeSession | null> =>
  db.sessions.find(
    (s) => s.access_token_hash === hash && s.revoked_at === null && s.access_expires_at.getTime() > Date.now(),
  ) ?? null;

export const findActiveSessionByRefreshTokenHash = async (hash: string): Promise<FakeSession | null> =>
  db.sessions.find(
    (s) => s.refresh_token_hash === hash && s.revoked_at === null && s.refresh_expires_at.getTime() > Date.now(),
  ) ?? null;

export const rotateSession = async (params: {
  sessionId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
}): Promise<FakeSession | null> => {
  const row = db.sessions.find((s) => s.id === params.sessionId && s.revoked_at === null);
  if (!row) return null;
  row.access_token_hash = params.accessTokenHash;
  row.refresh_token_hash = params.refreshTokenHash;
  row.access_expires_at = params.accessExpiresAt;
  return row;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  const row = db.sessions.find((s) => s.id === sessionId);
  if (row && row.revoked_at === null) row.revoked_at = new Date();
};

export const revokeAllSessionsForAdmin = async (adminUserId: string): Promise<void> => {
  for (const row of db.sessions) {
    if (row.admin_user_id === adminUserId && row.revoked_at === null) {
      row.revoked_at = new Date();
    }
  }
};

// Administration-only additions below, mirroring session.repository.ts.

export const listSessionsForAdmin = async (
  adminUserId: string,
  limit: number,
  offset: number,
): Promise<FakeSession[]> =>
  db.sessions
    .filter((s) => s.admin_user_id === adminUserId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(offset, offset + limit);

export const findLatestSessionForAdmin = async (adminUserId: string): Promise<FakeSession | null> => {
  const sessions = db.sessions
    .filter((s) => s.admin_user_id === adminUserId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return sessions[0] ?? null;
};

export const countActiveSessionsForAdmin = async (adminUserId: string): Promise<number> =>
  db.sessions.filter(
    (s) => s.admin_user_id === adminUserId && s.revoked_at === null && s.refresh_expires_at.getTime() > Date.now(),
  ).length;
