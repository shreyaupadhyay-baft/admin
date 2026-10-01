import { pool } from "../infrastructure/database/pool.js";

export type CampaignRow = {
  id: string;
  name: string;
  description: string;
  campaign_type: string;
  status: string;
  start_at: Date | null;
  end_at: Date | null;
  audience_definition: Record<string, unknown>;
  targeting_definition: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export const listCampaigns = async (params: {
  limit: number;
  offset: number;
  status?: string;
  campaignType?: string;
  search?: string;
}): Promise<CampaignRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.campaignType) conditions.push(`campaign_type = $${values.push(params.campaignType)}`);
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(name) LIKE $${likeIndex} OR LOWER(description) LIKE $${likeIndex})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<CampaignRow>(
    `SELECT * FROM campaigns ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findCampaignById = async (id: string): Promise<CampaignRow | null> => {
  const { rows } = await pool.query<CampaignRow>("SELECT * FROM campaigns WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createCampaign = async (params: {
  name: string;
  description: string;
  campaignType: string;
  audienceDefinition: Record<string, unknown>;
  targetingDefinition: Record<string, unknown>;
  createdBy: string;
}): Promise<CampaignRow> => {
  const { rows } = await pool.query<CampaignRow>(
    `INSERT INTO campaigns (name, description, campaign_type, audience_definition, targeting_definition, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.name,
      params.description,
      params.campaignType,
      JSON.stringify(params.audienceDefinition),
      JSON.stringify(params.targetingDefinition),
      params.createdBy,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createCampaign: insert returned no row");
  return row;
};

export const updateCampaignFields = async (
  id: string,
  fields: {
    name?: string;
    description?: string;
    campaignType?: string;
    audienceDefinition?: Record<string, unknown>;
    targetingDefinition?: Record<string, unknown>;
  },
): Promise<CampaignRow | null> => {
  const { rows } = await pool.query<CampaignRow>(
    `UPDATE campaigns
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         campaign_type = COALESCE($4, campaign_type),
         audience_definition = COALESCE($5, audience_definition),
         targeting_definition = COALESCE($6, targeting_definition),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      fields.name ?? null,
      fields.description ?? null,
      fields.campaignType ?? null,
      fields.audienceDefinition !== undefined ? JSON.stringify(fields.audienceDefinition) : null,
      fields.targetingDefinition !== undefined ? JSON.stringify(fields.targetingDefinition) : null,
    ],
  );
  return rows[0] ?? null;
};

export const scheduleCampaign = async (
  id: string,
  params: { startAt: Date; endAt: Date | null },
): Promise<CampaignRow | null> => {
  const { rows } = await pool.query<CampaignRow>(
    `UPDATE campaigns
     SET status = 'scheduled', start_at = $2, end_at = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, params.startAt, params.endAt],
  );
  return rows[0] ?? null;
};

export const transitionCampaignStatus = async (id: string, status: string): Promise<CampaignRow | null> => {
  const { rows } = await pool.query<CampaignRow>(
    `UPDATE campaigns SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};
