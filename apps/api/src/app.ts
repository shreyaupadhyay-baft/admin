import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import { corsAllowedOrigins } from "./config/env.js";
import { correlationIdMiddleware } from "./middleware/correlationId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { httpLoggerMiddleware } from "./middleware/httpLogger.js";
import { v1Router } from "./routes/index.js";

export const createApp = () => {
  const app = express();

  // Deny-by-default posture: explicit allowlist, no wildcard origins,
  // security headers on by default, request bodies capped.
  app.use(helmet());
  app.use(
    cors({
      origin: corsAllowedOrigins,
      credentials: true,
    }),
  );
  app.use(hpp());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use(correlationIdMiddleware);
  app.use(httpLoggerMiddleware);

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use("/api/v1", v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
