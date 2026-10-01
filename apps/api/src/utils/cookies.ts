import type { Request, Response } from "express";
import { isProduction } from "../config/env.js";

export const ACCESS_TOKEN_COOKIE = "baft_admin_access_token";
export const REFRESH_TOKEN_COOKIE = "baft_admin_refresh_token";

// localhost:5173 (web) and localhost:4000 (api) differ only by port, which
// browsers treat as the same "site" for SameSite purposes, so Lax cookies
// still flow cross-port in dev without needing SameSite=None+Secure.
const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
};

export const setAccessTokenCookie = (res: Response, token: string, expiresAt: Date) => {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseCookieOptions,
    path: "/",
    expires: expiresAt,
  });
};

export const setRefreshTokenCookie = (res: Response, token: string, expiresAt: Date) => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseCookieOptions,
    path: "/api/v1/auth",
    expires: expiresAt,
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions, path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseCookieOptions, path: "/api/v1/auth" });
};

// No cookie-parser dependency: Express 5 doesn't parse cookies by default,
// but the format is simple enough to read directly off the raw header.
export const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }

  return null;
};
