import { pool } from "../infrastructure/database/pool.js";
import { escapeLikeSpecials } from "../utils/sql.js";

export type AuditLogRow = {
  id: string;
  actor_admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export const insertAuditLog = async (params: {
  actorAdminId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  await pool.query(
    `INSERT INTO audit_logs
       (actor_admin_id, action, target_type, target_id, request_id, correlation_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.actorAdminId,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.requestId ?? null,
      params.correlationId ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
};

export const listAuditLogs = async (limit: number, offset: number): Promise<AuditLogRow[]> => {
  const { rows } = await pool.query<AuditLogRow>(
    "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [limit, offset],
  );
  return rows;
};

// The enriched row the Administration Audit UI reads: the same audit_logs
// columns, plus the actor's current email/full_name resolved via a LEFT JOIN
// so the UI never has to show a bare admin UUID. LEFT JOIN (not INNER) so a
// row with actor_admin_id = NULL (system-initiated) or an admin the FK set to
// NULL on delete still returns the audit row itself, just without an actor.
export type AuditLogWithActorRow = AuditLogRow & { actor_email: string | null; actor_full_name: string | null };

// Administration-only: filterable read view over the same audit_logs table
// (not a second audit system). The original listAuditLogs() above is
// unchanged and keeps backing the Phase 1 /api/v1/audit-logs endpoint.
export const listAuditLogsFiltered = async (params: {
  limit: number;
  offset: number;
  actorAdminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** Case-insensitive substring match across action/target/actor identity — never across metadata. */
  search?: string;
}): Promise<{ rows: AuditLogWithActorRow[]; total: number }> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.actorAdminId) conditions.push(`al.actor_admin_id = $${values.push(params.actorAdminId)}`);
  if (params.action) conditions.push(`al.action = $${values.push(params.action)}`);
  if (params.targetType) conditions.push(`al.target_type = $${values.push(params.targetType)}`);
  if (params.targetId) conditions.push(`al.target_id = $${values.push(params.targetId)}`);
  if (params.dateFrom) conditions.push(`al.created_at >= $${values.push(params.dateFrom)}`);
  if (params.dateTo) conditions.push(`al.created_at <= $${values.push(params.dateTo)}`);
  if (params.search) {
    const contains = `%${escapeLikeSpecials(params.search)}%`;
    const likeIndex = values.push(contains);
    conditions.push(
      `(al.id::text ILIKE $${likeIndex} ESCAPE '\\' OR al.action ILIKE $${likeIndex} ESCAPE '\\'
        OR al.target_type ILIKE $${likeIndex} ESCAPE '\\' OR al.target_id ILIKE $${likeIndex} ESCAPE '\\'
        OR au.email ILIKE $${likeIndex} ESCAPE '\\' OR au.full_name ILIKE $${likeIndex} ESCAPE '\\')`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<AuditLogWithActorRow & { total_count: string }>(
    `SELECT al.*, au.email AS actor_email, au.full_name AS actor_full_name, COUNT(*) OVER()::int AS total_count
     FROM audit_logs al
     LEFT JOIN admin_users au ON au.id = al.actor_admin_id
     ${whereClause}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );

  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  return { rows, total };
};

/** Single audit event with the same actor enrichment as the list view — the Audit detail drawer's data source. IDOR-safe: gated by the same administration.audit.read permission as the list, with no other scoping (audit is a platform-wide record, not per-admin-owned). */
export const findAuditLogById = async (id: string): Promise<AuditLogWithActorRow | null> => {
  const { rows } = await pool.query<AuditLogWithActorRow>(
    `SELECT al.*, au.email AS actor_email, au.full_name AS actor_full_name
     FROM audit_logs al
     LEFT JOIN admin_users au ON au.id = al.actor_admin_id
     WHERE al.id = $1`,
    [id],
  );
  return rows[0] ?? null;
};
