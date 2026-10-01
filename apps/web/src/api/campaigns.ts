import { apiGet, apiPatch, apiPost } from "./client.js";

export type CampaignType = "promotional" | "referral" | "retention" | "reengagement" | "other";
export type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "cancelled";

export type Campaign = {
  id: string;
  name: string;
  description: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  startAt: string | null;
  endAt: string | null;
  audienceDefinition: Record<string, unknown>;
  targetingDefinition: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const fetchCampaigns = async (params: {
  limit?: number;
  offset?: number;
  status?: CampaignStatus;
  campaignType?: CampaignType;
  search?: string;
}): Promise<{ campaigns: Campaign[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.campaignType) query.set("campaignType", params.campaignType);
  if (params.search) query.set("search", params.search);

  const res = await apiGet<{ campaigns: Campaign[] }>(`/api/v1/campaigns?${query.toString()}`);
  return {
    campaigns: res.data.campaigns,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchCampaign = async (id: string): Promise<Campaign> => {
  const res = await apiGet<{ campaign: Campaign }>(`/api/v1/campaigns/${id}`);
  return res.data.campaign;
};

export const createCampaign = async (payload: {
  name: string;
  description?: string;
  campaignType: CampaignType;
  audienceDefinition?: Record<string, unknown>;
  targetingDefinition?: Record<string, unknown>;
}): Promise<Campaign> => {
  const res = await apiPost<{ campaign: Campaign }>("/api/v1/campaigns", payload);
  return res.data.campaign;
};

export const updateCampaign = async (
  id: string,
  payload: Partial<{ name: string; description: string; campaignType: CampaignType }>,
): Promise<Campaign> => {
  const res = await apiPatch<{ campaign: Campaign }>(`/api/v1/campaigns/${id}`, payload);
  return res.data.campaign;
};

export const scheduleCampaign = async (id: string, startAt: string, endAt?: string): Promise<Campaign> => {
  const res = await apiPost<{ campaign: Campaign }>(`/api/v1/campaigns/${id}/schedule`, { startAt, endAt });
  return res.data.campaign;
};

export const activateCampaign = async (id: string): Promise<Campaign> => {
  const res = await apiPost<{ campaign: Campaign }>(`/api/v1/campaigns/${id}/activate`);
  return res.data.campaign;
};

export const completeCampaign = async (id: string): Promise<Campaign> => {
  const res = await apiPost<{ campaign: Campaign }>(`/api/v1/campaigns/${id}/complete`);
  return res.data.campaign;
};

export const cancelCampaign = async (id: string): Promise<Campaign> => {
  const res = await apiPost<{ campaign: Campaign }>(`/api/v1/campaigns/${id}/cancel`);
  return res.data.campaign;
};
