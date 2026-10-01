import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/response.js";

export const validateBody = (schema: ZodType) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new AppError("VALIDATION_ERROR", result.error.issues.map((issue) => issue.message).join("; "), 400));
      return;
    }
    req.body = result.data;
    next();
  };
};

export const validateParams = (schema: ZodType) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new AppError("VALIDATION_ERROR", result.error.issues.map((issue) => issue.message).join("; "), 400));
      return;
    }
    next();
  };
};
