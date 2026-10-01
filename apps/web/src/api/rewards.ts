import { apiGet, apiPatch, apiPost } from "./client.js";

export type RewardType = "cashback" | "points" | "voucher" | "fee_waiver" | "bonus";
export type RewardStatus = "draft" | "active" | "paused" | "expired" | "cancelled";

export type Reward = {
  id: string;
  name: string;
  description: string;
  rewardType: RewardType;
  status: RewardStatus;
  ruleDefinition: Record<string, unknown>;
  validFrom: string | null;
  validUntil: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EntitlementResult = {
  rewardId: string;
  userId: string;
  rewardStatus: RewardStatus;
  eligible: boolean;
  entitled: boolean;
  combinator: "AND" | "OR";
  evaluatedConditions: Array<{ field: string; operator: string; value: unknown; actual: unknown; passed: boolean }>;
};

export const fetchRewards = async (params: {
  limit?: number;
  offset?: number;
  status?: RewardStatus;
  rewardType?: RewardType;
  search?: string;
}): Promise<{ rewards: Reward[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.rewardType) query.set("rewardType", params.rewardType);
  if (params.search) query.set("search", params.search);

  const res = await apiGet<{ rewards: Reward[] }>(`/api/v1/rewards?${query.toString()}`);
  return {
    rewards: res.data.rewards,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchReward = async (id: string): Promise<Reward> => {
  const res = await apiGet<{ reward: Reward }>(`/api/v1/rewards/${id}`);
  return res.data.reward;
};

export const createReward = async (payload: {
  name: string;
  description?: string;
  rewardType: RewardType;
  ruleDefinition?: Record<string, unknown>;
}): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>("/api/v1/rewards", payload);
  return res.data.reward;
};

export const updateReward = async (
  id: string,
  payload: Partial<{ name: string; description: string; rewardType: RewardType }>,
): Promise<Reward> => {
  const res = await apiPatch<{ reward: Reward }>(`/api/v1/rewards/${id}`, payload);
  return res.data.reward;
};

export const activateReward = async (id: string): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>(`/api/v1/rewards/${id}/activate`);
  return res.data.reward;
};

export const pauseReward = async (id: string): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>(`/api/v1/rewards/${id}/pause`);
  return res.data.reward;
};

export const resumeReward = async (id: string): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>(`/api/v1/rewards/${id}/resume`);
  return res.data.reward;
};

export const expireReward = async (id: string): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>(`/api/v1/rewards/${id}/expire`);
  return res.data.reward;
};

export const cancelReward = async (id: string): Promise<Reward> => {
  const res = await apiPost<{ reward: Reward }>(`/api/v1/rewards/${id}/cancel`);
  return res.data.reward;
};

export const checkRewardEntitlement = async (id: string, userId: string): Promise<EntitlementResult> => {
  const res = await apiGet<{ entitlement: EntitlementResult }>(
    `/api/v1/rewards/${id}/entitlement?userId=${encodeURIComponent(userId)}`,
  );
  return res.data.entitlement;
};
