import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { ReportController } from "./ReportController";

const controller = new ReportController();

export const reportRouter = Router();

reportRouter.post("/", authenticate, controller.create);
reportRouter.get(
  "/",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.list
);
reportRouter.patch(
  "/:reportId/resolve",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.resolve
);
reportRouter.patch(
  "/:reportId/dismiss",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.dismiss
);
reportRouter.patch(
  "/:reportId/suspend",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.suspend
);
