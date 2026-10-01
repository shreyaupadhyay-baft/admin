import { pool } from "../infrastructure/database/pool.js";

export type DeviceRow = {
  id: string;
  user_id: string;
  device_ref: string;
  platform: string;
  status: string;
  first_seen_at: Date;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
};

export const listDevices = async (params: {
  limit: number;
  offset: number;
  status?: string;
  userId?: string;
}): Promise<DeviceRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) {
    conditions.push(`status = $${values.push(params.status)}`);
  }
  if (params.userId) {
    conditions.push(`user_id = $${values.push(params.userId)}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<DeviceRow>(
    `SELECT * FROM devices ${whereClause} ORDER BY last_seen_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const listDevicesForUser = async (userId: string): Promise<DeviceRow[]> => {
  const { rows } = await pool.query<DeviceRow>(
    "SELECT * FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC",
    [userId],
  );
  return rows;
};

export const findDeviceById = async (id: string): Promise<DeviceRow | null> => {
  const { rows } = await pool.query<DeviceRow>("SELECT * FROM devices WHERE id = $1", [id]);
  return rows[0] ?? null;
};

// Devices are registered by the mobile app itself (out of scope for this
// admin-facing phase), not created via the Admin API. This exists for
// seeding/tests only and is intentionally not wired to a route.
export const createDevice = async (params: {
  userId: string;
  deviceRef: string;
  platform: string;
  status?: string;
}): Promise<DeviceRow> => {
  const { rows } = await pool.query<DeviceRow>(
    `INSERT INTO devices (user_id, device_ref, platform, status)
     VALUES ($1, $2, $3, COALESCE($4, 'active'))
     RETURNING *`,
    [params.userId, params.deviceRef, params.platform, params.status ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error("createDevice: insert returned no row");
  return row;
};

export const updateDeviceLink = async (id: string, userId: string): Promise<DeviceRow | null> => {
  const { rows } = await pool.query<DeviceRow>(
    `UPDATE devices SET user_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, userId],
  );
  return rows[0] ?? null;
};

export const updateDeviceStatus = async (id: string, status: string): Promise<DeviceRow | null> => {
  const { rows } = await pool.query<DeviceRow>(
    `UPDATE devices SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};
