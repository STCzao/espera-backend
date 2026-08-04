import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { OrganizationController } from "./OrganizationController";

const controller = new OrganizationController();

export const organizationRouter = Router();

organizationRouter.get(
  "/pending",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.listPending
);
organizationRouter.patch(
  "/:organizationId/approve",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.approve
);
organizationRouter.patch(
  "/:organizationId/reject",
  authenticate,
  authorize("platform:manage_approvals"),
  controller.reject
);
organizationRouter.patch(
  "/:organizationId",
  authenticate,
  authorize("organization:edit"),
  controller.update
);
