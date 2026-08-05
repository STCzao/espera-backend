import { Router } from "express";

import type { SocketIOEmitter } from "@modules/queue/public-api";
import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { BusinessController } from "./BusinessController";

export const createBusinessRouter = (emitter: SocketIOEmitter | null = null): Router => {
  const controller = new BusinessController(emitter);

  const businessRouter = Router();

  businessRouter.post("/", authenticate, controller.register);
  businessRouter.get("/me", authenticate, controller.listMine);
  businessRouter.get("/categories", controller.listCategories);
  businessRouter.get(
    "/categories/:categoryId/config",
    authenticate,
    authorize("business:edit"),
    controller.getCategoryConfig
  );
  businessRouter.post(
    "/employee-invitations/:token/accept",
    controller.acceptEmployeeInvitation
  );
  businessRouter.patch(
    "/:businessId/profile",
    authenticate,
    authorize("business:edit"),
    controller.updateProfile
  );
  businessRouter.get(
    "/:businessId/hours",
    authenticate,
    authorize("business:edit"),
    controller.getHours
  );
  businessRouter.post(
    "/:businessId/employees/invitations",
    authenticate,
    authorize("employee:manage"),
    controller.inviteEmployee
  );
  businessRouter.get(
    "/:businessId/employees",
    authenticate,
    authorize("employee:manage"),
    controller.listEmployees
  );
  businessRouter.delete(
    "/:businessId/employees/:userId",
    authenticate,
    authorize("employee:manage"),
    controller.revokeEmployee
  );
  businessRouter.put(
    "/:businessId/hours",
    authenticate,
    authorize("business:edit"),
    controller.configureHours
  );
  businessRouter.put(
    "/:businessId/service-windows",
    authenticate,
    authorize("business:edit"),
    controller.configureServiceWindows
  );
  businessRouter.patch(
    "/:businessId/operational-status",
    authenticate,
    authorize("business:edit"),
    controller.updateOperationalStatus
  );
  businessRouter.get(
    "/:businessId/qr",
    authenticate,
    authorize("business:edit"),
    controller.getQrCode
  );
  businessRouter.post(
    "/:businessId/qr/regenerate",
    authenticate,
    authorize("business:edit"),
    controller.regenerateQrCode
  );
  businessRouter.get(
    "/:businessId/qr.png",
    authenticate,
    authorize("business:edit"),
    controller.downloadQrPng
  );
  businessRouter.post(
    "/configure-queue",
    authenticate,
    authorize("queue:configure"),
    controller.configureQueue
  );
  businessRouter.get(
    "/pending",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.listPending
  );
  businessRouter.patch(
    "/:businessId/approve",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.approve
  );
  businessRouter.patch(
    "/:businessId/reject",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.reject
  );
  businessRouter.patch(
    "/:businessId/suspend",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.suspend
  );
  businessRouter.patch(
    "/:businessId/reactivate",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.reactivate
  );
  businessRouter.get(
    "/platform/metrics",
    authenticate,
    authorize("platform:manage_approvals"),
    controller.getPlatformMetrics
  );

  return businessRouter;
};
