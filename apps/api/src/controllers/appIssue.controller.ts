import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  assignAppIssue,
  createAppIssue,
  findAppIssueById,
  listAppIssues,
  resolveAppIssue,
  updateAppIssueFields,
  updateAppIssueStatus,
  type AppIssueRow,
} from "../repositories/appIssue.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { findAdminUserById } from "../repositories/adminUser.repository.js";
import { listAppIssuesQuerySchema } from "../validation/appIssue.schema.js";

const serializeIssue = (i: AppIssueRow) => ({
  id: i.id,
  userId: i.user_id,
  source: i.source,
  title: i.title,
  description: i.description,
  severity: i.severity,
  status: i.status,
  assignedAdminId: i.assigned_admin_id,
  createdAt: i.created_at,
  updatedAt: i.updated_at,
  resolvedAt: i.resolved_at,
});

export const listAppIssuesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listAppIssuesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, source, severity, assignedAdminId, userId } = parsed.data;
  const issues = await listAppIssues({ limit, offset, status, source, severity, assignedAdminId, userId });

  sendSuccess(res, 200, { appIssues: issues.map(serializeIssue) }, { limit, offset });
};

export const getAppIssueHandler = async (req: Request, res: Response): Promise<void> => {
  const issue = await findAppIssueById(req.params.id as string);
  if (!issue) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }
  sendSuccess(res, 200, { appIssue: serializeIssue(issue) });
};

export const createAppIssueHandler = async (req: Request, res: Response): Promise<void> => {
  const { userId, source, title, description, severity } = req.body as {
    userId?: string;
    source: string;
    title: string;
    description: string;
    severity: string;
  };

  if (userId !== undefined) {
    const user = await findUserById(userId);
    if (!user) {
      throw new AppError("USER_NOT_FOUND", "The user reporting this issue does not exist.", 400);
    }
  }

  const created = await createAppIssue({ userId, source, title, description, severity });

  await recordAudit(req, AUDIT_ACTIONS.APP_ISSUE_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "app_issue",
    targetId: created.id,
    metadata: { userId, source, title, severity },
  });

  sendSuccess(res, 201, { appIssue: serializeIssue(created) });
};

export const updateAppIssueHandler = async (req: Request, res: Response): Promise<void> => {
  const issueId = req.params.id as string;
  const { title, description, severity, status } = req.body as {
    title?: string;
    description?: string;
    severity?: string;
    status?: string;
  };

  const existing = await findAppIssueById(issueId);
  if (!existing) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  let current = existing;

  if (title !== undefined || description !== undefined || severity !== undefined) {
    const updated = await updateAppIssueFields(issueId, { title, description, severity });
    if (!updated) throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
    current = updated;

    await recordAudit(req, AUDIT_ACTIONS.APP_ISSUE_UPDATED, {
      actorAdminId,
      targetType: "app_issue",
      targetId: issueId,
      metadata: { title, severity },
    });
  }

  if (status !== undefined && status !== current.status) {
    const previousStatus = current.status;
    const updated = await updateAppIssueStatus(issueId, status);
    if (!updated) throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
    current = updated;

    await recordAudit(req, AUDIT_ACTIONS.APP_ISSUE_STATUS_CHANGED, {
      actorAdminId,
      targetType: "app_issue",
      targetId: issueId,
      metadata: { previousStatus, newStatus: status },
    });
  }

  sendSuccess(res, 200, { appIssue: serializeIssue(current) });
};

export const assignAppIssueHandler = async (req: Request, res: Response): Promise<void> => {
  const issueId = req.params.id as string;
  const { adminId } = req.body as { adminId: string | null };

  const existing = await findAppIssueById(issueId);
  if (!existing) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }

  if (adminId !== null) {
    const targetAdmin = await findAdminUserById(adminId);
    if (!targetAdmin) {
      throw new AppError("ADMIN_NOT_FOUND", "The admin to assign does not exist.", 400);
    }
  }

  const previousAdminId = existing.assigned_admin_id;
  const updated = await assignAppIssue(issueId, adminId);
  if (!updated) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }

  const isUnassigning = adminId === null;
  await recordAudit(req, isUnassigning ? AUDIT_ACTIONS.APP_ISSUE_UNASSIGNED : AUDIT_ACTIONS.APP_ISSUE_ASSIGNED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "app_issue",
    targetId: issueId,
    metadata: { previousAdminId, newAdminId: adminId },
  });

  sendSuccess(res, 200, { appIssue: serializeIssue(updated) });
};

export const resolveAppIssueHandler = async (req: Request, res: Response): Promise<void> => {
  const issueId = req.params.id as string;

  const existing = await findAppIssueById(issueId);
  if (!existing) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }

  const updated = await resolveAppIssue(issueId);
  if (!updated) {
    throw new AppError("APP_ISSUE_NOT_FOUND", "App issue not found.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.APP_ISSUE_RESOLVED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "app_issue",
    targetId: issueId,
  });

  sendSuccess(res, 200, { appIssue: serializeIssue(updated) });
};
