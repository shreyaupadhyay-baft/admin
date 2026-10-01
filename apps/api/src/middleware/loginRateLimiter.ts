import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { sendError } from "../utils/response.js";

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    sendError(res, req.requestId, 429, "RATE_LIMITED", "Too many login attempts. Please try again later.");
  },
});
