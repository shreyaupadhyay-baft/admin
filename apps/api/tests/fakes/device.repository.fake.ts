import { randomUUID } from "node:crypto";
import { db, FakeUniqueViolation } from "./store.js";
import type { FakeDevice } from "./store.js";

// Copies out, never live references — see user.repository.fake.ts for why.
const clone = (row: FakeDevice): FakeDevice => ({ ...row });

export const listDevices = async (params: {
  limit: number;
  offset: number;
  status?: string;
  userId?: string;
}): Promise<FakeDevice[]> => {
  let results = db.devices.map(clone);

  if (params.status) {
    results = results.filter((d) => d.status === params.status);
  }
  if (params.userId) {
    results = results.filter((d) => d.user_id === params.userId);
  }

  return results
    .sort((a, b) => b.last_seen_at.getTime() - a.last_seen_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const listDevicesForUser = async (userId: string): Promise<FakeDevice[]> =>
  db.devices
    .filter((d) => d.user_id === userId)
    .map(clone)
    .sort((a, b) => b.last_seen_at.getTime() - a.last_seen_at.getTime());

export const findDeviceById = async (id: string): Promise<FakeDevice | null> => {
  const row = db.devices.find((d) => d.id === id);
  return row ? clone(row) : null;
};

export const createDevice = async (params: {
  userId: string;
  deviceRef: string;
  platform: string;
  status?: string;
}): Promise<FakeDevice> => {
  if (db.devices.some((d) => d.device_ref === params.deviceRef)) {
    throw new FakeUniqueViolation("duplicate device_ref");
  }
  const now = new Date();
  const row: FakeDevice = {
    id: randomUUID(),
    user_id: params.userId,
    device_ref: params.deviceRef,
    platform: params.platform,
    status: params.status ?? "active",
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
  };
  db.devices.push(row);
  return clone(row);
};

export const updateDeviceLink = async (id: string, userId: string): Promise<FakeDevice | null> => {
  const row = db.devices.find((d) => d.id === id);
  if (!row) return null;
  row.user_id = userId;
  row.updated_at = new Date();
  return clone(row);
};

export const updateDeviceStatus = async (id: string, status: string): Promise<FakeDevice | null> => {
  const row = db.devices.find((d) => d.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};
