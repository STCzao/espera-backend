import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { BusinessController } from "./BusinessController";

const controller = new BusinessController();

export const businessRouter = Router();

businessRouter.post("/", authenticate, authorize("business:edit"), controller.register);
businessRouter.patch(
  "/:businessId/profile",
  authenticate,
  authorize("business:edit"),
  controller.updateProfile
);
businessRouter.post(
  "/configure-queue",
  authenticate,
  authorize("queue:configure"),
  controller.configureQueue
);
