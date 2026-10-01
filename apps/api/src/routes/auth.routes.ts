import { Router } from "express";
import { loginHandler, logoutHandler, meHandler, refreshHandler } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { loginRateLimiter } from "../middleware/loginRateLimiter.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema } from "../validation/auth.schema.js";

export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, validateBody(loginSchema), loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.get("/me", authenticate, meHandler);
