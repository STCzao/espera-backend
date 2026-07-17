import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { CallNextUseCase } from "../application/CallNextUseCase";
import { CancelTurnUseCase } from "../application/CancelTurnUseCase";
import { CreateTurnUseCase } from "../application/CreateTurnUseCase";
import { GetMyTurnUseCase } from "../application/GetMyTurnUseCase";

export class QueueController {
  public constructor(
    private readonly createTurnUseCase = new CreateTurnUseCase(),
    private readonly getMyTurnUseCase = new GetMyTurnUseCase(),
    private readonly callNextUseCase = new CallNextUseCase(),
    private readonly cancelTurnUseCase = new CancelTurnUseCase(),
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

  public callNext = async (request: Request, response: Response): Promise<void> => {
    const result = await this.callNextUseCase.execute({
      queueId: String(request.body.queueId),
    });
    logger.info({ turnId: result.turnId, queueId: result.queueId }, "Next turn called");
    response.status(200).json(result);
  };

  public cancelTurn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelTurnUseCase.execute(request.body);
    logger.info({ turnId: request.body.turnId }, "Turn cancelled");
    response.status(200).json(result);
  };
}
