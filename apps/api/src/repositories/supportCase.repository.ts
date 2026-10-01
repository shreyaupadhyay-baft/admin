import { pool } from "../infrastructure/database/pool.js";

export type SupportCaseRow = {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  closed_at: Date | null;
};

export const listSupportCases = async (params: {
  limit: number;
  offset: number;
  status?: string;
  category?: string;
  priority?: string;
  assignedAdminId?: string;
  userId?: string;
}): Promise<SupportCaseRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.category) conditions.push(`category = $${values.push(params.category)}`);
  if (params.priority) conditions.push(`priority = $${values.push(params.priority)}`);
  if (params.assignedAdminId) conditions.push(`assigned_admin_id = $${values.push(params.assignedAdminId)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<SupportCaseRow>(
    `SELECT * FROM support_cases ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findSupportCaseById = async (id: string): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>("SELECT * FROM support_cases WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createSupportCase = async (params: {
  userId: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
}): Promise<SupportCaseRow> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `INSERT INTO support_cases (user_id, subject, description, category, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.userId, params.subject, params.description, params.category, params.priority],
  );
  const row = rows[0];
  if (!row) throw new Error("createSupportCase: insert returned no row");
  return row;
};

export const updateSupportCaseFields = async (
  id: string,
  fields: { subject?: string; description?: string; category?: string; priority?: string },
): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `UPDATE support_cases
     SET subject = COALESCE($2, subject),
         description = COALESCE($3, description),
         category = COALESCE($4, category),
         priority = COALESCE($5, priority),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.subject ?? null, fields.description ?? null, fields.category ?? null, fields.priority ?? null],
  );
  return rows[0] ?? null;
};

export const updateSupportCaseStatus = async (id: string, status: string): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `UPDATE support_cases SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};

export const assignSupportCase = async (id: string, adminId: string | null): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `UPDATE support_cases SET assigned_admin_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, adminId],
  );
  return rows[0] ?? null;
};

export const resolveSupportCase = async (id: string): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `UPDATE support_cases SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
};

export const closeSupportCase = async (id: string): Promise<SupportCaseRow | null> => {
  const { rows } = await pool.query<SupportCaseRow>(
    `UPDATE support_cases SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
};
