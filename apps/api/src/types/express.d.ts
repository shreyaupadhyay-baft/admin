import "express";
import type { AuthenticatedAdmin } from "./rbac.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      correlationId: string;
      admin?: AuthenticatedAdmin;
    }
  }
}

export {};
