import { pool } from "../infrastructure/database/pool.js";

export type ApprovalRow = {
  id: string;
  approval_number: string;
  action_type: string;
  resource_type: string;
  resource_id: string;
  requested_by: string;
  approver_admin_id: string | null;
  status: string;
  reason: string;
  rejection_reason: string | null;
  request_metadata: Record<string, unknown>;
  execution_status: string | null;
  execution_result: Record<string, unknown> | null;
  idempotency_key: string | null;
  request_id: string | null;
  correlation_id: string | null;
  requested_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  rejected_at: Date | null;
  cancelled_at: Date | null;
  expired_at: Date | null;
  executed_at: Date | null;
};

export const listApprovals = async (params: {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  actionType?: string;
  resourceType?: string;
  requestedBy?: string;
  approverAdminId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "newest" | "oldest";
}): Promise<ApprovalRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.actionType) conditions.push(`action_type = $${values.push(params.actionType)}`);
  if (params.resourceType) conditions.push(`resource_type = $${values.push(params.resourceType)}`);
  if (params.requestedBy) conditions.push(`requested_by = $${values.push(params.requestedBy)}`);
  if (params.approverAdminId) conditions.push(`approver_admin_id = $${values.push(params.approverAdminId)}`);
  if (params.dateFrom) conditions.push(`requested_at >= $${values.push(params.dateFrom)}`);
  if (params.dateTo) conditions.push(`requested_at <= $${values.push(params.dateTo)}`);
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(
      `(LOWER(approval_number) LIKE $${likeIndex} OR LOWER(reason) LIKE $${likeIndex} OR LOWER(resource_id) LIKE $${likeIndex})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const direction = params.sort === "oldest" ? "ASC" : "DESC";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<ApprovalRow>(
    `SELECT * FROM approvals ${whereClause}
     ORDER BY requested_at ${direction}, id ${direction}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findApprovalById = async (id: string): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>("SELECT * FROM approvals WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const findApprovalByIdempotencyKey = async (key: string): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>("SELECT * FROM approvals WHERE idempotency_key = $1", [key]);
  return rows[0] ?? null;
};

export const createApproval = async (params: {
  actionType: string;
  resourceType: string;
  resourceId: string;
  requestedBy: string;
  reason: string;
  metadata: Record<string, unknown>;
  idempotencyKey?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
}): Promise<ApprovalRow> => {
  const { rows } = await pool.query<ApprovalRow>(
    `INSERT INTO approvals
       (approval_number, action_type, resource_type, resource_id, requested_by, reason, request_metadata, idempotency_key, request_id, correlation_id)
     VALUES
       ('APR-' || LPAD(nextval('approval_number_seq')::text, 6, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      params.actionType,
      params.resourceType,
      params.resourceId,
      params.requestedBy,
      params.reason,
      JSON.stringify(params.metadata),
      params.idempotencyKey ?? null,
      params.requestId ?? null,
      params.correlationId ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createApproval: insert returned no row");
  return row;
};

// Every transition below is a single atomic `UPDATE ... WHERE status =
// 'requested'` — Postgres serializes concurrent UPDATEs to the same row, so
// only one concurrent approve/reject/cancel call can ever succeed; the
// others get back `null` (0 rows affected) and the caller turns that into a
// 409. This is what makes "at most once" execution and "no double
// approval/rejection" hold under concurrency without extra locking.

export const transitionApprovalToApproved = async (id: string, approverAdminId: string): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>(
    `UPDATE approvals
     SET status = 'approved', approver_admin_id = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'requested'
     RETURNING *`,
    [id, approverAdminId],
  );
  return rows[0] ?? null;
};

export const transitionApprovalToRejected = async (
  id: string,
  approverAdminId: string,
  rejectionReason: string,
): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>(
    `UPDATE approvals
     SET status = 'rejected', approver_admin_id = $2, rejection_reason = $3, rejected_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'requested'
     RETURNING *`,
    [id, approverAdminId, rejectionReason],
  );
  return rows[0] ?? null;
};

export const transitionApprovalToCancelled = async (id: string): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>(
    `UPDATE approvals
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'requested'
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
};

export const recordApprovalExecutionResult = async (
  id: string,
  params: { status: "executed" | "failed"; result: Record<string, unknown> },
): Promise<ApprovalRow | null> => {
  const { rows } = await pool.query<ApprovalRow>(
    `UPDATE approvals
     SET execution_status = $2,
         execution_result = $3,
         executed_at = CASE WHEN $2 = 'executed' THEN NOW() ELSE executed_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, params.status, JSON.stringify(params.result)],
  );
  return rows[0] ?? null;
};
