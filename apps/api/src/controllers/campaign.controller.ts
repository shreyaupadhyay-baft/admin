import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  createCampaign,
  findCampaignById,
  listCampaigns,
  scheduleCampaign,
  transitionCampaignStatus,
  updateCampaignFields,
  type CampaignRow,
} from "../repositories/campaign.repository.js";
import { listCampaignsQuerySchema } from "../validation/campaign.schema.js";

const serializeCampaign = (c: CampaignRow) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  campaignType: c.campaign_type,
  status: c.status,
  startAt: c.start_at,
  endAt: c.end_at,
  audienceDefinition: c.audience_definition,
  targetingDefinition: c.targeting_definition,
  createdBy: c.created_by,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

const invalidTransition = (message: string) => new AppError("INVALID_TRANSITION", message, 409);

const notFound = () => new AppError("CAMPAIGN_NOT_FOUND", "Campaign not found.", 404);

export const listCampaignsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listCampaignsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, campaignType, search } = parsed.data;
  const campaigns = await listCampaigns({ limit, offset, status, campaignType, search });

  sendSuccess(res, 200, { campaigns: campaigns.map(serializeCampaign) }, { limit, offset });
};

export const getCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaign = await findCampaignById(req.params.id as string);
  if (!campaign) throw notFound();
  sendSuccess(res, 200, { campaign: serializeCampaign(campaign) });
};

export const createCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description, campaignType, audienceDefinition, targetingDefinition } = req.body as {
    name: string;
    description: string;
    campaignType: string;
    audienceDefinition: Record<string, unknown>;
    targetingDefinition: Record<string, unknown>;
  };

  const createdBy = req.admin?.id as string;
  const created = await createCampaign({ name, description, campaignType, audienceDefinition, targetingDefinition, createdBy });

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_CREATED, {
    actorAdminId: createdBy,
    targetType: "campaign",
    targetId: created.id,
    metadata: { name, campaignType },
  });

  sendSuccess(res, 201, { campaign: serializeCampaign(created) });
};

export const updateCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.params.id as string;
  const { name, description, campaignType, audienceDefinition, targetingDefinition } = req.body as {
    name?: string;
    description?: string;
    campaignType?: string;
    audienceDefinition?: Record<string, unknown>;
    targetingDefinition?: Record<string, unknown>;
  };

  const updated = await updateCampaignFields(campaignId, {
    name,
    description,
    campaignType,
    audienceDefinition,
    targetingDefinition,
  });
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { name, campaignType },
  });

  sendSuccess(res, 200, { campaign: serializeCampaign(updated) });
};

export const scheduleCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.params.id as string;
  const { startAt, endAt } = req.body as { startAt: Date; endAt?: Date };

  const existing = await findCampaignById(campaignId);
  if (!existing) throw notFound();
  if (existing.status !== "draft") {
    throw invalidTransition(`Cannot schedule a campaign from status '${existing.status}'; must be 'draft'.`);
  }

  const updated = await scheduleCampaign(campaignId, { startAt, endAt: endAt ?? null });
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_SCHEDULED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { startAt, endAt },
  });

  sendSuccess(res, 200, { campaign: serializeCampaign(updated) });
};

export const activateCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.params.id as string;

  const existing = await findCampaignById(campaignId);
  if (!existing) throw notFound();
  if (existing.status !== "scheduled") {
    throw invalidTransition(`Cannot activate a campaign from status '${existing.status}'; must be 'scheduled'.`);
  }

  const updated = await transitionCampaignStatus(campaignId, "active");
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_ACTIVATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "campaign",
    targetId: campaignId,
  });

  sendSuccess(res, 200, { campaign: serializeCampaign(updated) });
};

export const completeCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.params.id as string;

  const existing = await findCampaignById(campaignId);
  if (!existing) throw notFound();
  if (existing.status !== "active") {
    throw invalidTransition(`Cannot complete a campaign from status '${existing.status}'; must be 'active'.`);
  }

  const updated = await transitionCampaignStatus(campaignId, "completed");
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_COMPLETED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "campaign",
    targetId: campaignId,
  });

  sendSuccess(res, 200, { campaign: serializeCampaign(updated) });
};

export const cancelCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  const campaignId = req.params.id as string;

  const existing = await findCampaignById(campaignId);
  if (!existing) throw notFound();
  if (!["draft", "scheduled", "active"].includes(existing.status)) {
    throw invalidTransition(`Cannot cancel a campaign from status '${existing.status}'.`);
  }

  const updated = await transitionCampaignStatus(campaignId, "cancelled");
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.CAMPAIGN_CANCELLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "campaign",
    targetId: campaignId,
    metadata: { previousStatus: existing.status },
  });

  sendSuccess(res, 200, { campaign: serializeCampaign(updated) });
};
