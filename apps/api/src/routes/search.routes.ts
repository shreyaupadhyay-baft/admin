import { Router } from "express";
import { globalSearchHandler } from "../controllers/search.controller.js";
import { authenticate } from "../middleware/authenticate.js";

export const searchRouter = Router();

searchRouter.use(authenticate);

// No dedicated "search" permission: visibility per result type is derived
// from the admin's existing module permissions inside the handler itself.
searchRouter.get("/", globalSearchHandler);
