import { Router } from "express";
import { getDeviceHandler, listDevicesHandler, updateDeviceHandler } from "../controllers/device.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { updateDeviceSchema } from "../validation/device.schema.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const deviceRouter = Router();

deviceRouter.use(authenticate);

deviceRouter.get("/", requirePermission(PERMISSIONS.DEVICES_READ), listDevicesHandler);
deviceRouter.get("/:id", validateParams(idParamSchema), requirePermission(PERMISSIONS.DEVICES_READ), getDeviceHandler);
// No blanket requirePermission here: userId vs. status each carry their own
// permission, enforced inside the handler (see updateDeviceHandler).
deviceRouter.patch("/:id", validateParams(idParamSchema), validateBody(updateDeviceSchema), updateDeviceHandler);
