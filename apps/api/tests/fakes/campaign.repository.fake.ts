import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeCampaign } from "./store.js";

const clone = (row: FakeCampaign): FakeCampaign => ({ ...row });

export const listCampaigns = async (params: {
  limit: number;
  offset: number;
  status?: string;
  campaignType?: string;
  search?: string;
}): Promise<FakeCampaign[]> => {
  let results = db.campaigns.map(clone);

  if (params.status) results = results.filter((c) => c.status === params.status);
  if (params.campaignType) results = results.filter((c) => c.campaign_type === params.campaignType);
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle),
    );
  }

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findCampaignById = async (id: string): Promise<FakeCampaign | null> => {
  const row = db.campaigns.find((c) => c.id === id);
  return row ? clone(row) : null;
};

export const createCampaign = async (params: {
  name: string;
  description: string;
  campaignType: string;
  audienceDefinition: Record<string, unknown>;
  targetingDefinition: Record<string, unknown>;
  createdBy: string;
}): Promise<FakeCampaign> => {
  const now = new Date();
  const row: FakeCampaign = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    campaign_type: params.campaignType,
    status: "draft",
    start_at: null,
    end_at: null,
    audience_definition: params.audienceDefinition,
    targeting_definition: params.targetingDefinition,
    created_by: params.createdBy,
    created_at: now,
    updated_at: now,
  };
  db.campaigns.push(row);
  return clone(row);
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
): Promise<FakeCampaign | null> => {
  const row = db.campaigns.find((c) => c.id === id);
  if (!row) return null;
  if (fields.name !== undefined) row.name = fields.name;
  if (fields.description !== undefined) row.description = fields.description;
  if (fields.campaignType !== undefined) row.campaign_type = fields.campaignType;
  if (fields.audienceDefinition !== undefined) row.audience_definition = fields.audienceDefinition;
  if (fields.targetingDefinition !== undefined) row.targeting_definition = fields.targetingDefinition;
  row.updated_at = new Date();
  return clone(row);
};

export const scheduleCampaign = async (
  id: string,
  params: { startAt: Date; endAt: Date | null },
): Promise<FakeCampaign | null> => {
  const row = db.campaigns.find((c) => c.id === id);
  if (!row) return null;
  row.status = "scheduled";
  row.start_at = params.startAt;
  row.end_at = params.endAt;
  row.updated_at = new Date();
  return clone(row);
};

export const transitionCampaignStatus = async (id: string, status: string): Promise<FakeCampaign | null> => {
  const row = db.campaigns.find((c) => c.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};
