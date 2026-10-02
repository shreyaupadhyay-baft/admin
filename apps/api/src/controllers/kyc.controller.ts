import type { Request, Response } from "express";
import { lookupKycForUser } from "../services/kyc.service.js";
import { sendSuccess } from "../utils/response.js";

export const getKycHandler = async (req: Request, res: Response) => {
  const result = await lookupKycForUser(req, String(req.params.userId));
  // Sensitive, provider-sourced: never let a browser/proxy cache it.
  res.setHeader("Cache-Control", "no-store");
  sendSuccess(res, 200, result, { request_id: req.requestId });
};
