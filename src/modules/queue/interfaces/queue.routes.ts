import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { CallNextUseCase } from "../application/CallNextUseCase";
import { CancelTurnUseCase } from "../application/CancelTurnUseCase";
import { ConfirmTurnStatusUseCase } from "../application/ConfirmTurnStatusUseCase";
import { CreateTurnUseCase } from "../application/CreateTurnUseCase";
import { GetMyTurnUseCase } from "../application/GetMyTurnUseCase";
import { GetQueueListUseCase } from "../application/GetQueueListUseCase";
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
  );

  const router = Router();

  router.post("/:queueId/turns", authenticate, authorize("turn:create"), controller.createTurn);
  router.get("/:queueId/turns", authenticate, authorize("queue:read"), controller.getQueueList);
  router.get("/:queueId/turns/my-turn", authenticate, authorize("turn:read_own"), controller.getMyTurn);
  router.post("/:queueId/turns/my-turn/confirm-transit", authenticate, authorize("turn:update_own"), controller.confirmTransit);
  router.post("/:queueId/turns/my-turn/confirm-arrival", authenticate, authorize("turn:update_own"), controller.confirmArrival);
  router.post("/turns/call-next", authenticate, authorize("queue:call_next"), controller.callNext);
  router.post("/turns/cancel", authenticate, authorize("turn:cancel"), controller.cancelTurn);

  return router;
};
