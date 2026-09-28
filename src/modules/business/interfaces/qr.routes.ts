import { Router } from "express";

import { rateLimiter } from "../../../middleware/rateLimiter";
import { PublicQrController } from "./PublicQrController";

const controller = new PublicQrController();

export const qrRouter = Router();

qrRouter.get("/:token", rateLimiter, controller.resolve);
