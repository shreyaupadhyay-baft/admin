import type { Response } from "express";

export const sendSuccess = <T>(res: Response, status: number, data: T, meta: Record<string, unknown> = {}) => {
  res.status(status).json({ data, meta });
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export const sendError = (
  res: Response,
  requestId: string,
  status: number,
  code: string,
  message: string,
) => {
  res.status(status).json({
    error: {
      code,
      message,
      request_id: requestId,
    },
  });
};
