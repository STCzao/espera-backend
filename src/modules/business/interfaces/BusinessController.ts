import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { ConfigureQueueUseCase } from "../application/ConfigureQueueUseCase";
import { RegisterBusinessUseCase } from "../application/RegisterBusinessUseCase";

export class BusinessController {
  public constructor(
    private readonly registerBusinessUseCase = new RegisterBusinessUseCase(),
    private readonly configureQueueUseCase = new ConfigureQueueUseCase()
  ) {}

  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerBusinessUseCase.execute(request.body);
    logger.info({ businessId: result.businessId }, "Business registered");
    response.status(201).json(result);
  };

  public configureQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.configureQueueUseCase.execute(request.body);
    logger.info({ businessId: request.body.businessId }, "Queue configured");
    response.status(200).json(result);
  };
}
