import { pool } from "../infrastructure/database/pool.js";

export type RewardRow = {
  id: string;
  name: string;
  description: string;
  reward_type: string;
  status: string;
  rule_definition: Record<string, unknown>;
  valid_from: Date | null;
  valid_until: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export const listRewards = async (params: {
  limit: number;
  offset: number;
  status?: string;
  rewardType?: string;
  search?: string;
}): Promise<RewardRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.rewardType) conditions.push(`reward_type = $${values.push(params.rewardType)}`);
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(name) LIKE $${likeIndex} OR LOWER(description) LIKE $${likeIndex})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<RewardRow>(
    `SELECT * FROM rewards ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findRewardById = async (id: string): Promise<RewardRow | null> => {
  const { rows } = await pool.query<RewardRow>("SELECT * FROM rewards WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createReward = async (params: {
  name: string;
  description: string;
  rewardType: string;
  ruleDefinition: Record<string, unknown>;
  validFrom: Date | null;
  validUntil: Date | null;
  createdBy: string;
}): Promise<RewardRow> => {
  const { rows } = await pool.query<RewardRow>(
    `INSERT INTO rewards (name, description, reward_type, rule_definition, valid_from, valid_until, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.name,
      params.description,
      params.rewardType,
      JSON.stringify(params.ruleDefinition),
      params.validFrom,
      params.validUntil,
      params.createdBy,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createReward: insert returned no row");
  return row;
};

export const updateRewardFields = async (
  id: string,
  fields: {
    name?: string;
    description?: string;
    rewardType?: string;
    ruleDefinition?: Record<string, unknown>;
    validFrom?: Date;
    validUntil?: Date;
  },
): Promise<RewardRow | null> => {
  const { rows } = await pool.query<RewardRow>(
    `UPDATE rewards
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         reward_type = COALESCE($4, reward_type),
         rule_definition = COALESCE($5, rule_definition),
         valid_from = COALESCE($6, valid_from),
         valid_until = COALESCE($7, valid_until),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      fields.name ?? null,
      fields.description ?? null,
      fields.rewardType ?? null,
      fields.ruleDefinition !== undefined ? JSON.stringify(fields.ruleDefinition) : null,
      fields.validFrom ?? null,
      fields.validUntil ?? null,
    ],
  );
  return rows[0] ?? null;
};

export const transitionRewardStatus = async (id: string, status: string): Promise<RewardRow | null> => {
  const { rows } = await pool.query<RewardRow>(
    `UPDATE rewards SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};
