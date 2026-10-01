import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/response.js";
import { ACCESS_TOKEN_COOKIE, readCookie } from "../utils/cookies.js";
import { loadPrincipalFromAccessToken } from "../services/auth.service.js";

/** Populates req.admin from the access token cookie. 401 if missing/invalid/expired/disabled. */
export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const accessToken = readCookie(req, ACCESS_TOKEN_COOKIE);
  if (!accessToken) {
    next(new AppError("UNAUTHENTICATED", "Authentication is required.", 401));
    return;
  }

  const admin = await loadPrincipalFromAccessToken(accessToken);
  if (!admin) {
    next(new AppError("UNAUTHENTICATED", "Session is invalid or has expired.", 401));
    return;
  }

  req.admin = admin;
  next();
};
