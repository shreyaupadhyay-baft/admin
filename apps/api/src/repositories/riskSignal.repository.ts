import { pool } from "../infrastructure/database/pool.js";

export type RiskSignalRow = {
  id: string;
  signal_type: string;
  category: string;
  severity: string;
  source: string;
  status: string;
  user_id: string | null;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detected_at: Date;
  created_at: Date;
};

export const listRiskSignals = async (params: {
  limit: number;
  offset: number;
  category?: string;
  severity?: string;
  status?: string;
  source?: string;
  userId?: string;
  detectedFrom?: Date;
  detectedTo?: Date;
  sort: "newest" | "oldest";
}): Promise<RiskSignalRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.category) conditions.push(`category = $${values.push(params.category)}`);
  if (params.severity) conditions.push(`severity = $${values.push(params.severity)}`);
  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.source) conditions.push(`source = $${values.push(params.source)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);
  if (params.detectedFrom) conditions.push(`detected_at >= $${values.push(params.detectedFrom)}`);
  if (params.detectedTo) conditions.push(`detected_at <= $${values.push(params.detectedTo)}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const direction = params.sort === "oldest" ? "ASC" : "DESC";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<RiskSignalRow>(
    `SELECT * FROM risk_signals ${whereClause}
     ORDER BY detected_at ${direction}, id ${direction}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findRiskSignalById = async (id: string): Promise<RiskSignalRow | null> => {
  const { rows } = await pool.query<RiskSignalRow>("SELECT * FROM risk_signals WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createRiskSignal = async (params: {
  signalType: string;
  category: string;
  severity: string;
  source: string;
  userId?: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt?: Date;
}): Promise<RiskSignalRow> => {
  const { rows } = await pool.query<RiskSignalRow>(
    `INSERT INTO risk_signals
       (signal_type, category, severity, source, user_id, external_reference, description, metadata, detected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
     RETURNING *`,
    [
      params.signalType,
      params.category,
      params.severity,
      params.source,
      params.userId ?? null,
      params.externalReference ?? null,
      params.description,
      JSON.stringify(params.metadata),
      params.detectedAt ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createRiskSignal: insert returned no row");
  return row;
};

export const updateRiskSignalStatus = async (id: string, status: string): Promise<RiskSignalRow | null> => {
  const { rows } = await pool.query<RiskSignalRow>(
    "UPDATE risk_signals SET status = $2 WHERE id = $1 RETURNING *",
    [id, status],
  );
  return rows[0] ?? null;
};
