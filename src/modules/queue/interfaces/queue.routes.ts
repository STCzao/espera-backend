import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { QueueController } from "./QueueController";

const controller = new QueueController();

export const queueRouter = Router();

queueRouter.post("/:queueId/turns", authenticate, authorize("turn:create"), controller.createTurn);
queueRouter.post("/turns/call-next", authenticate, authorize("queue:call_next"), controller.callNext);
queueRouter.post("/turns/cancel", authenticate, authorize("turn:cancel"), controller.cancelTurn);
