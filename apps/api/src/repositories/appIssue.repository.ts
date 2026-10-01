import { pool } from "../infrastructure/database/pool.js";

export type AppIssueRow = {
  id: string;
  user_id: string | null;
  source: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
};

export const listAppIssues = async (params: {
  limit: number;
  offset: number;
  status?: string;
  source?: string;
  severity?: string;
  assignedAdminId?: string;
  userId?: string;
}): Promise<AppIssueRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.source) conditions.push(`source = $${values.push(params.source)}`);
  if (params.severity) conditions.push(`severity = $${values.push(params.severity)}`);
  if (params.assignedAdminId) conditions.push(`assigned_admin_id = $${values.push(params.assignedAdminId)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<AppIssueRow>(
    `SELECT * FROM app_issues ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findAppIssueById = async (id: string): Promise<AppIssueRow | null> => {
  const { rows } = await pool.query<AppIssueRow>("SELECT * FROM app_issues WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createAppIssue = async (params: {
  userId?: string | null;
  source: string;
  title: string;
  description: string;
  severity: string;
}): Promise<AppIssueRow> => {
  const { rows } = await pool.query<AppIssueRow>(
    `INSERT INTO app_issues (user_id, source, title, description, severity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.userId ?? null, params.source, params.title, params.description, params.severity],
  );
  const row = rows[0];
  if (!row) throw new Error("createAppIssue: insert returned no row");
  return row;
};

export const updateAppIssueFields = async (
  id: string,
  fields: { title?: string; description?: string; severity?: string },
): Promise<AppIssueRow | null> => {
  const { rows } = await pool.query<AppIssueRow>(
    `UPDATE app_issues
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         severity = COALESCE($4, severity),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.title ?? null, fields.description ?? null, fields.severity ?? null],
  );
  return rows[0] ?? null;
};

export const updateAppIssueStatus = async (id: string, status: string): Promise<AppIssueRow | null> => {
  const { rows } = await pool.query<AppIssueRow>(
    `UPDATE app_issues SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};

export const assignAppIssue = async (id: string, adminId: string | null): Promise<AppIssueRow | null> => {
  const { rows } = await pool.query<AppIssueRow>(
    `UPDATE app_issues SET assigned_admin_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, adminId],
  );
  return rows[0] ?? null;
};

export const resolveAppIssue = async (id: string): Promise<AppIssueRow | null> => {
  const { rows } = await pool.query<AppIssueRow>(
    `UPDATE app_issues SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
};
