import winston from "winston";
import { env } from "../config/env.js";

const { combine, timestamp, errors, json } = winston.format;

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(timestamp(), errors({ stack: true }), json()),
  defaultMeta: { service: "baft-admin-api" },
  transports: [new winston.transports.Console()],
});

export type LogContext = {
  requestId?: string;
  correlationId?: string;
  adminId?: string;
  [key: string]: unknown;
};

export const logWithContext = (
  level: "error" | "warn" | "info" | "http" | "debug",
  message: string,
  context: LogContext = {},
) => {
  logger.log(level, message, context);
};
