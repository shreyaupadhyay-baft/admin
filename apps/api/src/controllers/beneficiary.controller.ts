import type { Request, Response } from "express";
import { lookupBeneficiariesForUser } from "../services/beneficiary.service.js";
import { sendSuccess } from "../utils/response.js";

export const listBeneficiariesForUserHandler = async (req: Request, res: Response) => {
  const result = await lookupBeneficiariesForUser(req, String(req.params.id));
  // Sensitive, provider-sourced: never let a browser/proxy cache it.
  res.setHeader("Cache-Control", "no-store");
  sendSuccess(res, 200, result, { request_id: req.requestId });
};
