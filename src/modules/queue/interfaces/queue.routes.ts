import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { rateLimiter } from "../../../middleware/rateLimiter";
import { AttendTurnUseCase } from "../application/AttendTurnUseCase";
import { CallNextUseCase } from "../application/CallNextUseCase";
import { CancelTurnByEmployeeUseCase } from "../application/CancelTurnByEmployeeUseCase";
import { CancelTurnUseCase } from "../application/CancelTurnUseCase";
import { ConfirmTurnStatusUseCase } from "../application/ConfirmTurnStatusUseCase";
import { CreateGuestTurnUseCase } from "../application/CreateGuestTurnUseCase";
import { CreateManualTurnUseCase } from "../application/CreateManualTurnUseCase";
import { CreateServiceWindowUseCase } from "../application/CreateServiceWindowUseCase";
import { CreateTurnUseCase } from "../application/CreateTurnUseCase";
import { DeleteServiceWindowUseCase } from "../application/DeleteServiceWindowUseCase";
import { GetGuestTurnStatusUseCase } from "../application/GetGuestTurnStatusUseCase";
import { GetMyTurnUseCase } from "../application/GetMyTurnUseCase";
import { GetQueueListUseCase } from "../application/GetQueueListUseCase";
import { GetQueueMetricsUseCase } from "../application/GetQueueMetricsUseCase";
import { GetQueueStatusUseCase } from "../application/GetQueueStatusUseCase";
import { GetTurnHistoryUseCase } from "../application/GetTurnHistoryUseCase";
import { ListServiceWindowsUseCase } from "../application/ListServiceWindowsUseCase";
import { MarkTurnNoShowUseCase } from "../application/MarkTurnNoShowUseCase";
import { RedirectTurnUseCase } from "../application/RedirectTurnUseCase";
import { ToggleServiceWindowUseCase } from "../application/ToggleServiceWindowUseCase";
import { UpdateServiceWindowUseCase } from "../application/UpdateServiceWindowUseCase";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";
import { QueueController } from "./QueueController";

export const createQueueRouter = (emitter: SocketIOEmitter | null = null): Router => {
  const controller = new QueueController(
    new CreateTurnUseCase(),
    new GetMyTurnUseCase(),
    new CallNextUseCase(undefined, undefined, emitter),
    new CancelTurnUseCase(undefined, emitter),
    new ConfirmTurnStatusUseCase(undefined, emitter),
    new GetQueueListUseCase(),
    new CreateManualTurnUseCase(),
    new CancelTurnByEmployeeUseCase(undefined, emitter),
    new AttendTurnUseCase(undefined, undefined, emitter),
    new GetQueueStatusUseCase(),
    new GetTurnHistoryUseCase(),
    new GetQueueMetricsUseCase(),
    new ListServiceWindowsUseCase(),
    new CreateServiceWindowUseCase(),
    new ToggleServiceWindowUseCase(),
    new UpdateServiceWindowUseCase(),
    new DeleteServiceWindowUseCase(),
    new RedirectTurnUseCase(undefined, undefined, emitter),
    new MarkTurnNoShowUseCase(undefined, emitter),
    new CreateGuestTurnUseCase(),
    new GetGuestTurnStatusUseCase(),
  );

  const router = Router();

  // Public — HU-4.2, no session (web ligera / QR sin app).
  router.post("/guest-turns", rateLimiter, controller.createGuestTurn);
  router.get("/guest-turns/:turnId", controller.getGuestTurnStatus);

  router.get("/:queueId/status", authenticate, authorize("queue:read"), controller.getQueueStatus);
  router.get("/:queueId/metrics", authenticate, authorize("queue:read"), controller.getQueueMetrics);
  router.post("/:queueId/turns", authenticate, authorize("turn:create"), controller.createTurn);
  router.post("/:queueId/turns/manual", authenticate, authorize("turn:create_manual"), controller.createManualTurn);
  router.get("/:queueId/turns", authenticate, authorize("queue:read"), controller.getQueueList);
  router.get("/:queueId/turns/history", authenticate, authorize("queue:read"), controller.getTurnHistory);
  router.get("/:queueId/turns/my-turn", authenticate, authorize("turn:read_own"), controller.getMyTurn);
  router.post("/:queueId/turns/my-turn/confirm-transit", authenticate, authorize("turn:update_own"), controller.confirmTransit);
  router.post("/:queueId/turns/my-turn/confirm-arrival", authenticate, authorize("turn:update_own"), controller.confirmArrival);
  router.post("/turns/call-next", authenticate, authorize("queue:call_next"), controller.callNext);
  router.post("/turns/cancel", authenticate, authorize("turn:cancel"), controller.cancelTurn);
  router.post("/:queueId/turns/:turnId/cancel", authenticate, authorize("turn:cancel_any"), controller.cancelTurnByEmployee);
  router.post("/:queueId/turns/:turnId/attend", authenticate, authorize("turn:attend"), controller.attendTurn);
  router.post("/:queueId/turns/:turnId/redirect", authenticate, authorize("turn:attend"), controller.redirectTurn);
  router.post("/:queueId/turns/:turnId/no-show", authenticate, authorize("turn:mark_no_show"), controller.markTurnNoShow);

  router.get("/:queueId/windows",                    authenticate, authorize("queue:read"),      controller.listServiceWindows);
  router.post("/:queueId/windows",                   authenticate, authorize("queue:configure"), controller.createServiceWindow);
  router.patch("/:queueId/windows/:windowId",         authenticate, authorize("queue:configure"), controller.updateServiceWindow);
  router.patch("/:queueId/windows/:windowId/toggle",  authenticate, authorize("queue:configure"), controller.toggleServiceWindow);
  router.delete("/:queueId/windows/:windowId",        authenticate, authorize("queue:configure"), controller.deleteServiceWindow);

  return router;
};
