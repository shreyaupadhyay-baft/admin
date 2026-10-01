import { Router } from "express";
import { getDashboardHandler } from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// No dedicated "dashboard" permission: each section's visibility is derived
// from that module's own existing read permission inside the handler.
dashboardRouter.get("/", getDashboardHandler);
