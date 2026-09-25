import { Router } from "express";
import { healthRouter } from "./health.routes.js";

export const v1Router = Router();

v1Router.use("/health", healthRouter);

// Domain routers (users, risk, admin-management, transcorp, engineering, ...)
// are added here in later phases — none exist yet by design.
