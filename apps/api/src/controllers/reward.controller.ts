import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS, type AuditAction } from "../constants/auditActions.js";
import { evaluateRewardEntitlement } from "../services/rewardEntitlement.service.js";
import {
  createReward,
  findRewardById,
  listRewards,
  transitionRewardStatus,
  updateRewardFields,
  type RewardRow,
} from "../repositories/reward.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { entitlementQuerySchema, listRewardsQuerySchema } from "../validation/reward.schema.js";

const serializeReward = (r: RewardRow) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  rewardType: r.reward_type,
  status: r.status,
  ruleDefinition: r.rule_definition,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const invalidTransition = (message: string) => new AppError("INVALID_TRANSITION", message, 409);
const notFound = () => new AppError("REWARD_NOT_FOUND", "Reward rule not found.", 404);

export const listRewardsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listRewardsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, rewardType, search } = parsed.data;
  const rewards = await listRewards({ limit, offset, status, rewardType, search });

  sendSuccess(res, 200, { rewards: rewards.map(serializeReward) }, { limit, offset });
};

export const getRewardHandler = async (req: Request, res: Response): Promise<void> => {
  const reward = await findRewardById(req.params.id as string);
  if (!reward) throw notFound();
  sendSuccess(res, 200, { reward: serializeReward(reward) });
};

export const createRewardHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description, rewardType, ruleDefinition, validFrom, validUntil } = req.body as {
    name: string;
    description: string;
    rewardType: string;
    ruleDefinition: Record<string, unknown>;
    validFrom?: Date;
    validUntil?: Date;
  };

  const createdBy = req.admin?.id as string;
  const created = await createReward({
    name,
    description,
    rewardType,
    ruleDefinition,
    validFrom: validFrom ?? null,
    validUntil: validUntil ?? null,
    createdBy,
  });

  await recordAudit(req, AUDIT_ACTIONS.REWARD_CREATED, {
    actorAdminId: createdBy,
    targetType: "reward",
    targetId: created.id,
    metadata: { name, rewardType },
  });

  sendSuccess(res, 201, { reward: serializeReward(created) });
};

export const updateRewardHandler = async (req: Request, res: Response): Promise<void> => {
  const rewardId = req.params.id as string;
  const { name, description, rewardType, ruleDefinition, validFrom, validUntil } = req.body as {
    name?: string;
    description?: string;
    rewardType?: string;
    ruleDefinition?: Record<string, unknown>;
    validFrom?: Date;
    validUntil?: Date;
  };

  const updated = await updateRewardFields(rewardId, { name, description, rewardType, ruleDefinition, validFrom, validUntil });
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.REWARD_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "reward",
    targetId: rewardId,
    metadata: { name, rewardType },
  });

  sendSuccess(res, 200, { reward: serializeReward(updated) });
};

const makeTransitionHandler = (allowedFrom: string[], toStatus: string, auditAction: AuditAction) => {
  return async (req: Request, res: Response): Promise<void> => {
    const rewardId = req.params.id as string;

    const existing = await findRewardById(rewardId);
    if (!existing) throw notFound();
    if (!allowedFrom.includes(existing.status)) {
      throw invalidTransition(
        `Cannot move a reward from status '${existing.status}' to '${toStatus}'; must be one of: ${allowedFrom.join(", ")}.`,
      );
    }

    const updated = await transitionRewardStatus(rewardId, toStatus);
    if (!updated) throw notFound();

    await recordAudit(req, auditAction, {
      actorAdminId: req.admin?.id ?? null,
      targetType: "reward",
      targetId: rewardId,
      metadata: { previousStatus: existing.status, newStatus: toStatus },
    });

    sendSuccess(res, 200, { reward: serializeReward(updated) });
  };
};

export const activateRewardHandler = makeTransitionHandler(["draft"], "active", AUDIT_ACTIONS.REWARD_ACTIVATED);
export const pauseRewardHandler = makeTransitionHandler(["active"], "paused", AUDIT_ACTIONS.REWARD_PAUSED);
export const resumeRewardHandler = makeTransitionHandler(["paused"], "active", AUDIT_ACTIONS.REWARD_RESUMED);
export const expireRewardHandler = makeTransitionHandler(["active", "paused"], "expired", AUDIT_ACTIONS.REWARD_EXPIRED);
export const cancelRewardHandler = makeTransitionHandler(
  ["draft", "active", "paused"],
  "cancelled",
  AUDIT_ACTIONS.REWARD_CANCELLED,
);

export const getRewardEntitlementHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = entitlementQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const reward = await findRewardById(req.params.id as string);
  if (!reward) throw notFound();

  const user = await findUserById(parsed.data.userId);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  const result = evaluateRewardEntitlement(reward.rule_definition, user);

  sendSuccess(res, 200, {
    entitlement: {
      rewardId: reward.id,
      userId: user.id,
      rewardStatus: reward.status,
      eligible: result.eligible,
      entitled: result.eligible && reward.status === "active",
      combinator: result.combinator,
      evaluatedConditions: result.evaluatedConditions,
    },
  });
};
