import { Router } from "express";

import { PublicQrController } from "./PublicQrController";

const controller = new PublicQrController();

export const qrRouter = Router();

qrRouter.get("/:token", controller.resolve);
