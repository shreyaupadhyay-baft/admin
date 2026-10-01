import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { assertPermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  findDeviceById,
  listDevices,
  listDevicesForUser,
  updateDeviceLink,
  updateDeviceStatus,
  type DeviceRow,
} from "../repositories/device.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { listDevicesQuerySchema } from "../validation/device.schema.js";

const serializeDevice = (device: DeviceRow, canReadStatus: boolean) => ({
  id: device.id,
  userId: device.user_id,
  deviceRef: device.device_ref,
  platform: device.platform,
  ...(canReadStatus ? { status: device.status } : {}),
  firstSeenAt: device.first_seen_at,
  lastSeenAt: device.last_seen_at,
  createdAt: device.created_at,
  updatedAt: device.updated_at,
});

export const listDevicesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listDevicesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.DEVICES_STATUS_READ) ?? false;
  if (parsed.data.status !== undefined && !canReadStatus) {
    throw new AppError("FORBIDDEN", "You do not have permission to filter by status.", 403);
  }

  const { limit = 50, offset = 0, status, userId } = parsed.data;
  const devices = await listDevices({ limit, offset, status, userId });

  sendSuccess(res, 200, { devices: devices.map((device) => serializeDevice(device, canReadStatus)) }, { limit, offset });
};

export const getDeviceHandler = async (req: Request, res: Response): Promise<void> => {
  const device = await findDeviceById(req.params.id as string);
  if (!device) {
    throw new AppError("DEVICE_NOT_FOUND", "Device not found.", 404);
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.DEVICES_STATUS_READ) ?? false;
  sendSuccess(res, 200, { device: serializeDevice(device, canReadStatus) });
};

// A single PATCH route serves both IA sub-items (Linked User, Status), each
// gated by its own permission since one admin may hold either without the
// other (e.g. Risk/Fraud can change status but not relink; Operations can do both).
export const updateDeviceHandler = async (req: Request, res: Response): Promise<void> => {
  const { userId, status } = req.body as { userId?: string; status?: string };
  const deviceId = req.params.id as string;

  const existing = await findDeviceById(deviceId);
  if (!existing) {
    throw new AppError("DEVICE_NOT_FOUND", "Device not found.", 404);
  }

  let current = existing;

  if (userId !== undefined) {
    await assertPermission(req, PERMISSIONS.DEVICES_UPDATE);

    const targetUser = await findUserById(userId);
    if (!targetUser) {
      throw new AppError("USER_NOT_FOUND", "Target user does not exist.", 400);
    }

    const previousUserId = current.user_id;
    const relinked = await updateDeviceLink(deviceId, userId);
    if (!relinked) {
      throw new AppError("DEVICE_NOT_FOUND", "Device not found.", 404);
    }
    current = relinked;

    await recordAudit(req, AUDIT_ACTIONS.DEVICE_UPDATED, {
      actorAdminId: req.admin?.id ?? null,
      targetType: "device",
      targetId: deviceId,
      metadata: { previousUserId, newUserId: userId },
    });
  }

  if (status !== undefined) {
    await assertPermission(req, PERMISSIONS.DEVICES_STATUS_UPDATE);

    const previousStatus = current.status;
    const statusUpdated = await updateDeviceStatus(deviceId, status);
    if (!statusUpdated) {
      throw new AppError("DEVICE_NOT_FOUND", "Device not found.", 404);
    }
    current = statusUpdated;

    await recordAudit(req, AUDIT_ACTIONS.DEVICE_STATUS_CHANGED, {
      actorAdminId: req.admin?.id ?? null,
      targetType: "device",
      targetId: deviceId,
      metadata: { previousStatus, newStatus: status },
    });
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.DEVICES_STATUS_READ) ?? false;
  sendSuccess(res, 200, { device: serializeDevice(current, canReadStatus) });
};

export const listDevicesForUserHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.id as string;

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  }

  const canReadStatus = req.admin?.permissions.includes(PERMISSIONS.DEVICES_STATUS_READ) ?? false;
  const devices = await listDevicesForUser(userId);
  sendSuccess(res, 200, { devices: devices.map((device) => serializeDevice(device, canReadStatus)) });
};
