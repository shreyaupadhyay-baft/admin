import { pool } from "../infrastructure/database/pool.js";

export type SecurityEventRow = {
  id: string;
  event_type: string;
  category: string;
  severity: string;
  source: string;
  status: string;
  user_id: string | null;
  device_id: string | null;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
};

export const listSecurityEvents = async (params: {
  limit: number;
  offset: number;
  eventType?: string;
  category?: string;
  severity?: string;
  status?: string;
  source?: string;
  userId?: string;
  deviceId?: string;
  detectedFrom?: Date;
  detectedTo?: Date;
  search?: string;
  sort: "newest" | "oldest";
}): Promise<SecurityEventRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.eventType) conditions.push(`event_type = $${values.push(params.eventType)}`);
  if (params.category) conditions.push(`category = $${values.push(params.category)}`);
  if (params.severity) conditions.push(`severity = $${values.push(params.severity)}`);
  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.source) conditions.push(`source = $${values.push(params.source)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);
  if (params.deviceId) conditions.push(`device_id = $${values.push(params.deviceId)}`);
  if (params.detectedFrom) conditions.push(`detected_at >= $${values.push(params.detectedFrom)}`);
  if (params.detectedTo) conditions.push(`detected_at <= $${values.push(params.detectedTo)}`);
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(event_type) LIKE $${likeIndex} OR LOWER(description) LIKE $${likeIndex})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const direction = params.sort === "oldest" ? "ASC" : "DESC";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<SecurityEventRow>(
    `SELECT * FROM security_events ${whereClause}
     ORDER BY detected_at ${direction}, id ${direction}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findSecurityEventById = async (id: string): Promise<SecurityEventRow | null> => {
  const { rows } = await pool.query<SecurityEventRow>("SELECT * FROM security_events WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createSecurityEvent = async (params: {
  eventType: string;
  category: string;
  severity: string;
  source: string;
  userId?: string;
  deviceId?: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt?: Date;
}): Promise<SecurityEventRow> => {
  const { rows } = await pool.query<SecurityEventRow>(
    `INSERT INTO security_events
       (event_type, category, severity, source, user_id, device_id, external_reference, description, metadata, detected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
     RETURNING *`,
    [
      params.eventType,
      params.category,
      params.severity,
      params.source,
      params.userId ?? null,
      params.deviceId ?? null,
      params.externalReference ?? null,
      params.description,
      JSON.stringify(params.metadata),
      params.detectedAt ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createSecurityEvent: insert returned no row");
  return row;
};

export const updateSecurityEventStatus = async (id: string, status: string): Promise<SecurityEventRow | null> => {
  const { rows } = await pool.query<SecurityEventRow>(
    "UPDATE security_events SET status = $2 WHERE id = $1 RETURNING *",
    [id, status],
  );
  return rows[0] ?? null;
};

export const countSecurityEventsBySeverities = async (severities: string[], since: Date): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM security_events WHERE severity = ANY($1::text[]) AND detected_at >= $2",
    [severities, since],
  );
  return Number(rows[0]?.count ?? 0);
};

export const listRecentSecurityEvents = async (limit: number): Promise<SecurityEventRow[]> => {
  const { rows } = await pool.query<SecurityEventRow>(
    "SELECT * FROM security_events ORDER BY detected_at DESC, id DESC LIMIT $1",
    [limit],
  );
  return rows;
};
