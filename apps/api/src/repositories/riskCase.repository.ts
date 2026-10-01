import { pool } from "../infrastructure/database/pool.js";

export type RiskCaseRow = {
  id: string;
  case_number: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  user_id: string | null;
  assigned_admin_id: string | null;
  summary: string;
  source: string;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

export const listRiskCases = async (params: {
  limit: number;
  offset: number;
  status?: string;
  severity?: string;
  category?: string;
  assignedAdminId?: string;
  userId?: string;
  search?: string;
}): Promise<RiskCaseRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.severity) conditions.push(`severity = $${values.push(params.severity)}`);
  if (params.category) conditions.push(`category = $${values.push(params.category)}`);
  if (params.assignedAdminId) conditions.push(`assigned_admin_id = $${values.push(params.assignedAdminId)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(title) LIKE $${likeIndex} OR LOWER(summary) LIKE $${likeIndex} OR LOWER(case_number) LIKE $${likeIndex})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<RiskCaseRow>(
    `SELECT * FROM risk_cases ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findRiskCaseById = async (id: string): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>("SELECT * FROM risk_cases WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createRiskCase = async (params: {
  title: string;
  category: string;
  severity: string;
  userId?: string;
  summary: string;
  source: string;
}): Promise<RiskCaseRow> => {
  const { rows } = await pool.query<RiskCaseRow>(
    `INSERT INTO risk_cases (case_number, title, category, severity, user_id, summary, source)
     VALUES ('RC-' || LPAD(nextval('risk_case_number_seq')::text, 6, '0'), $1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [params.title, params.category, params.severity, params.userId ?? null, params.summary, params.source],
  );
  const row = rows[0];
  if (!row) throw new Error("createRiskCase: insert returned no row");
  return row;
};

export const updateRiskCaseFields = async (
  id: string,
  fields: { title?: string; summary?: string; category?: string },
): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    `UPDATE risk_cases
     SET title = COALESCE($2, title),
         summary = COALESCE($3, summary),
         category = COALESCE($4, category),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.title ?? null, fields.summary ?? null, fields.category ?? null],
  );
  return rows[0] ?? null;
};

export const assignRiskCase = async (id: string, adminId: string | null): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    "UPDATE risk_cases SET assigned_admin_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, adminId],
  );
  return rows[0] ?? null;
};

export const updateRiskCaseStatus = async (id: string, status: string): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    "UPDATE risk_cases SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, status],
  );
  return rows[0] ?? null;
};

export const updateRiskCaseSeverity = async (id: string, severity: string): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    "UPDATE risk_cases SET severity = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, severity],
  );
  return rows[0] ?? null;
};

export const resolveRiskCase = async (id: string): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    "UPDATE risk_cases SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *",
    [id],
  );
  return rows[0] ?? null;
};

export const closeRiskCase = async (id: string): Promise<RiskCaseRow | null> => {
  const { rows } = await pool.query<RiskCaseRow>(
    "UPDATE risk_cases SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *",
    [id],
  );
  return rows[0] ?? null;
};
