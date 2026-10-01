import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeReward } from "./store.js";

const clone = (row: FakeReward): FakeReward => ({ ...row });

export const listRewards = async (params: {
  limit: number;
  offset: number;
  status?: string;
  rewardType?: string;
  search?: string;
}): Promise<FakeReward[]> => {
  let results = db.rewards.map(clone);

  if (params.status) results = results.filter((r) => r.status === params.status);
  if (params.rewardType) results = results.filter((r) => r.reward_type === params.rewardType);
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
    );
  }

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findRewardById = async (id: string): Promise<FakeReward | null> => {
  const row = db.rewards.find((r) => r.id === id);
  return row ? clone(row) : null;
};

export const createReward = async (params: {
  name: string;
  description: string;
  rewardType: string;
  ruleDefinition: Record<string, unknown>;
  validFrom: Date | null;
  validUntil: Date | null;
  createdBy: string;
}): Promise<FakeReward> => {
  const now = new Date();
  const row: FakeReward = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    reward_type: params.rewardType,
    status: "draft",
    rule_definition: params.ruleDefinition,
    valid_from: params.validFrom,
    valid_until: params.validUntil,
    created_by: params.createdBy,
    created_at: now,
    updated_at: now,
  };
  db.rewards.push(row);
  return clone(row);
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
): Promise<FakeReward | null> => {
  const row = db.rewards.find((r) => r.id === id);
  if (!row) return null;
  if (fields.name !== undefined) row.name = fields.name;
  if (fields.description !== undefined) row.description = fields.description;
  if (fields.rewardType !== undefined) row.reward_type = fields.rewardType;
  if (fields.ruleDefinition !== undefined) row.rule_definition = fields.ruleDefinition;
  if (fields.validFrom !== undefined) row.valid_from = fields.validFrom;
  if (fields.validUntil !== undefined) row.valid_until = fields.validUntil;
  row.updated_at = new Date();
  return clone(row);
};

export const transitionRewardStatus = async (id: string, status: string): Promise<FakeReward | null> => {
  const row = db.rewards.find((r) => r.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};
