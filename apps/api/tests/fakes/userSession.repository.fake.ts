import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeUserSession } from "./store.js";

const clone = (row: FakeUserSession): FakeUserSession => ({ ...row });

export const createUserSession = async (params: { userId: string; deviceId?: string | null }): Promise<FakeUserSession> => {
  const row: FakeUserSession = {
    id: randomUUID(),
    user_id: params.userId,
    device_id: params.deviceId ?? null,
    status: "active",
    created_at: new Date(),
    revoked_at: null,
  };
  db.userSessions.push(row);
  return clone(row);
};

export const listActiveUserSessions = async (userId: string): Promise<FakeUserSession[]> =>
  db.userSessions.filter((s) => s.user_id === userId && s.status === "active").map(clone);

export const revokeAllActiveUserSessions = async (userId: string): Promise<FakeUserSession[]> => {
  const revoked: FakeUserSession[] = [];
  for (const row of db.userSessions) {
    if (row.user_id === userId && row.status === "active") {
      row.status = "revoked";
      row.revoked_at = new Date();
      revoked.push(clone(row));
    }
  }
  return revoked;
};
