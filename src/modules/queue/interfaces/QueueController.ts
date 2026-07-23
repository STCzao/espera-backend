import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { AttendTurnUseCase } from "../application/AttendTurnUseCase";
import { CallNextUseCase } from "../application/CallNextUseCase";
import { CancelTurnByEmployeeUseCase } from "../application/CancelTurnByEmployeeUseCase";
import { CancelTurnUseCase } from "../application/CancelTurnUseCase";
import { ConfirmTurnStatusUseCase } from "../application/ConfirmTurnStatusUseCase";
import { CreateManualTurnUseCase } from "../application/CreateManualTurnUseCase";
import { CreateTurnUseCase } from "../application/CreateTurnUseCase";
import { GetMyTurnUseCase } from "../application/GetMyTurnUseCase";
import { GetQueueListUseCase } from "../application/GetQueueListUseCase";
import { GetQueueStatusUseCase } from "../application/GetQueueStatusUseCase";

export class QueueController {
  public constructor(
    private readonly createTurnUseCase = new CreateTurnUseCase(),
    private readonly getMyTurnUseCase = new GetMyTurnUseCase(),
    private readonly callNextUseCase = new CallNextUseCase(),
    private readonly cancelTurnUseCase = new CancelTurnUseCase(),
    private readonly confirmTurnStatusUseCase = new ConfirmTurnStatusUseCase(),
    private readonly getQueueListUseCase = new GetQueueListUseCase(),
    private readonly createManualTurnUseCase = new CreateManualTurnUseCase(),
    private readonly cancelTurnByEmployeeUseCase = new CancelTurnByEmployeeUseCase(),
    private readonly attendTurnUseCase = new AttendTurnUseCase(),
  private readonly getQueueStatusUseCase = new GetQueueStatusUseCase(),
  ) {}

  public createTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createTurnUseCase.execute({
      queueId: String(request.params.queueId),
      customerId: request.user?.id,
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Turn created");
    response.status(201).json(result);
  };

  public getMyTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getMyTurnUseCase.execute({
      queueId: String(request.params.queueId),
      customerId: String(request.user?.id),
    });
    response.status(200).json(result);
  };

  public getQueueList = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getQueueListUseCase.execute({
      queueId: String(request.params.queueId),
    });
    response.status(200).json(result);
  };

  public createManualTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createManualTurnUseCase.execute({
      queueId:   String(request.params.queueId),
      guestName: String(request.body.guestName),
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Manual turn created");
    response.status(201).json(result);
  };

  public confirmTransit = async (request: Request, response: Response): Promise<void> => {
    const result = await this.confirmTurnStatusUseCase.execute({
      queueId:    String(request.params.queueId),
      customerId: String(request.user?.id),
      action:     "in_transit",
    });
    response.status(200).json(result);
  };

  public confirmArrival = async (request: Request, response: Response): Promise<void> => {
    const result = await this.confirmTurnStatusUseCase.execute({
      queueId:    String(request.params.queueId),
      customerId: String(request.user?.id),
      action:     "arrived",
    });
    response.status(200).json(result);
  };

  public callNext = async (request: Request, response: Response): Promise<void> => {
    const result = await this.callNextUseCase.execute({
      queueId: String(request.body.queueId),
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Next turn called");
    response.status(200).json(result);
  };

  public attendTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.attendTurnUseCase.execute({
      turnId: String(request.params.turnId),
    });
    logger.info({ turnId: result.turnId }, "Turn marked as attended");
    response.status(200).json(result);
  };

  public cancelTurnByEmployee = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelTurnByEmployeeUseCase.execute({
      turnId: String(request.params.turnId),
    });
    logger.info({ turnId: result.turnId }, "Turn cancelled by employee");
    response.status(200).json(result);
  };

  public getQueueStatus = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getQueueStatusUseCase.execute({
      queueId: String(request.params.queueId),
    });
    response.status(200).json(result);
  };

  public cancelTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelTurnUseCase.execute({
      turnId: String(request.body.turnId),
      customerId: String(request.user?.id),
    });
    logger.info({ turnId: result.turnId }, "Turn cancelled");
    response.status(200).json(result);
  };
}
