import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { isUniqueViolation } from "../utils/db.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  createUser,
  findUserById,
  listUsers,
  updateUserProfile,
  updateUserStatus,
  type UserRow,
} from "../repositories/user.repository.js";
import { listDevicesForUser, type DeviceRow } from "../repositories/device.repository.js";
import { listUsersQuerySchema } from "../validation/user.schema.js";

// `status` is its own IA sub-item (gated by users.status.read), separate from
// the base Profile fields (gated by users.read, already required to reach
// this handler at all) — so it's only included when the caller also holds
// users.status.read. `securityStatus` (added by the Security module) reuses
// this same gate rather than inventing a new permission just for one field —
// it is set only by the security action workflow, never by users.update.
const serializeUser = (user: UserRow, canReadStatus: boolean) => ({
  id: user.id,
  externalRef: user.external_ref,
  email: user.email,
  phoneNumber: user.phone_number,
  fullName: user.full_name,
  ...(canReadStatus ? { status: user.status, securityStatus: user.security_status } : {}),
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

const serializeDeviceSummary = (device: DeviceRow, canReadStatus: boolean) => ({
  id: device.id,
  deviceRef: device.device_ref,
  platform: device.platform,
  ...(canReadStatus ? { status: device.status } : {}),
  firstSeenAt: device.first_seen_at,
  lastSeenAt: device.last_seen_at,
});

export const listUsersHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  if (parsed.data.status !== undefined && !canReadStatus) {
    throw new AppError("FORBIDDEN", "You do not have permission to filter by status.", 403);
  }

  const { limit = 50, offset = 0, status, search } = parsed.data;
  const users = await listUsers({ limit, offset, status, search });

  sendSuccess(res, 200, { users: users.map((user) => serializeUser(user, canReadStatus)) }, { limit, offset });
};

export const getUserHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await findUserById(req.params.id as string);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  sendSuccess(res, 200, { user: serializeUser(user, canReadStatus) });
};

export const createUserHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, phoneNumber, fullName, externalRef } = req.body as {
    email: string;
    phoneNumber?: string;
    fullName: string;
    externalRef?: string;
  };

  let created: UserRow;
  try {
    created = await createUser({ email, phoneNumber, fullName, externalRef });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("USER_ALREADY_EXISTS", "A user with this email or phone number already exists.", 409);
    }
    throw err;
  }

  await recordAudit(req, AUDIT_ACTIONS.USER_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "user",
    targetId: created.id,
    metadata: { email: created.email, fullName: created.full_name },
  });

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  sendSuccess(res, 201, { user: serializeUser(created, canReadStatus) });
};

export const updateUserHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, phoneNumber, fullName } = req.body as { email?: string; phoneNumber?: string; fullName?: string };

  let updated: UserRow | null;
  try {
    updated = await updateUserProfile(req.params.id as string, { email, phoneNumber, fullName });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("USER_ALREADY_EXISTS", "A user with this email or phone number already exists.", 409);
    }
    throw err;
  }

  if (!updated) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.USER_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "user",
    targetId: updated.id,
    metadata: { email, phoneNumber, fullName },
  });

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  sendSuccess(res, 200, { user: serializeUser(updated, canReadStatus) });
};

export const updateUserStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const { status, reason } = req.body as { status: string; reason?: string };

  const existing = await findUserById(req.params.id as string);
  if (!existing) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  const updated = await updateUserStatus(existing.id, status);
  if (!updated) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.USER_STATUS_CHANGED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "user",
    targetId: updated.id,
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  sendSuccess(res, 200, { user: serializeUser(updated, canReadStatus) });
};

// Devices are a sub-resource of a user's overview (see IA), so seeing them
// here only requires users.read — the standalone /devices endpoints still
// enforce devices.read/devices.status.read independently for direct access.
export const getUserOverviewHandler = async (req: Request, res: Response): Promise<void> => {
  const user = await findUserById(req.params.id as string);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  const canReadUserStatus = req.admin?.permissions.includes(PERMISSIONS.USERS_STATUS_READ) ?? false;
  const canReadDeviceStatus = req.admin?.permissions.includes(PERMISSIONS.DEVICES_STATUS_READ) ?? false;
  const devices = await listDevicesForUser(user.id);

  sendSuccess(res, 200, {
    overview: {
      profile: { fullName: user.full_name, email: user.email, phoneNumber: user.phone_number },
      ...(canReadUserStatus ? { status: user.status } : {}),
      devices: devices.map((device) => serializeDeviceSummary(device, canReadDeviceStatus)),
      supportCases: {
        available: false,
        note: "Support case history is not implemented yet; it will appear here once the Support module ships.",
      },
      externalReference: {
        ref: user.external_ref,
        note:
          "KYC, transaction, and other Transcorp-owned data are not included here. That belongs to the Transcorp integration domain, implemented separately.",
      },
    },
  });
};
