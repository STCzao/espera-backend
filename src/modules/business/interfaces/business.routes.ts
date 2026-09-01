import { Router } from "express";

import type { SocketIOEmitter } from "@modules/queue/public-api";
import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { BusinessAdminController } from "./BusinessAdminController";
import { BusinessController } from "./BusinessController";
import { BusinessEmployeeController } from "./BusinessEmployeeController";

export const createBusinessRouter = (emitter: SocketIOEmitter | null = null): Router => {
  const controller = new BusinessController();
  const employeeController = new BusinessEmployeeController();
  const adminController = new BusinessAdminController(emitter);

  const businessRouter = Router();

  businessRouter.post("/", authenticate, controller.register);
  businessRouter.get(
    "/",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.listAll
  );
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
    employeeController.acceptEmployeeInvitation
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
    employeeController.inviteEmployee
  );
  businessRouter.get(
    "/:businessId/employees",
    authenticate,
    authorize("employee:manage"),
    employeeController.listEmployees
  );
  businessRouter.get(
    "/:businessId/employees/invitations",
    authenticate,
    authorize("employee:manage"),
    employeeController.listPendingEmployeeInvitations
  );
  businessRouter.delete(
    "/:businessId/employees/:userId",
    authenticate,
    authorize("employee:manage"),
    employeeController.revokeEmployee
  );
  businessRouter.delete(
    "/:businessId/employees/invitations/:invitationId",
    authenticate,
    authorize("employee:manage"),
    employeeController.cancelEmployeeInvitation
  );
  businessRouter.put(
    "/:businessId/hours",
    authenticate,
    authorize("business:edit"),
    controller.configureHours
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
    "/:businessId/queues",
    authenticate,
    authorize("queue:configure"),
    controller.createQueue
  );
  businessRouter.get(
    "/:businessId/queues",
    authenticate,
    authorize("queue:read"),
    controller.listQueues
  );
  businessRouter.patch(
    "/:businessId/queues/:queueId/toggle",
    authenticate,
    authorize("queue:configure"),
    controller.toggleQueue
  );
  businessRouter.get(
    "/pending",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.listPending
  );
  businessRouter.get(
    "/:businessId/review",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.getReviewDetail
  );
  businessRouter.patch(
    "/:businessId/approve",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.approve
  );
  businessRouter.patch(
    "/:businessId/reject",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.reject
  );
  businessRouter.patch(
    "/:businessId/suspend",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.suspend
  );
  businessRouter.patch(
    "/:businessId/reactivate",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.reactivate
  );
  businessRouter.get(
    "/platform/metrics",
    authenticate,
    authorize("platform:manage_approvals"),
    adminController.getPlatformMetrics
  );

  return businessRouter;
};
