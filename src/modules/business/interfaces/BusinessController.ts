import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { ConfigureBusinessHoursUseCase } from "../application/ConfigureBusinessHoursUseCase";
import { ConfigureQueueUseCase } from "../application/ConfigureQueueUseCase";
import { ConfigureBusinessServiceWindowsUseCase } from "../application/ConfigureBusinessServiceWindowsUseCase";
import { GetBusinessHoursUseCase } from "../application/GetBusinessHoursUseCase";
import { RegisterBusinessUseCase } from "../application/RegisterBusinessUseCase";
import { UpdateBusinessProfileUseCase } from "../application/UpdateBusinessProfileUseCase";

export class BusinessController {
  public constructor(
    private readonly registerBusinessUseCase = new RegisterBusinessUseCase(),
    private readonly configureQueueUseCase = new ConfigureQueueUseCase(),
    private readonly updateBusinessProfileUseCase = new UpdateBusinessProfileUseCase(),
    private readonly configureBusinessHoursUseCase = new ConfigureBusinessHoursUseCase(),
    private readonly getBusinessHoursUseCase = new GetBusinessHoursUseCase(),
    private readonly configureBusinessServiceWindowsUseCase = new ConfigureBusinessServiceWindowsUseCase()
  ) {}

  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerBusinessUseCase.execute({
      ...request.body,
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.businessId }, "Business registered");
    response.status(201).json(result);
  };

  public updateProfile = async (request: Request, response: Response): Promise<void> => {
    const result = await this.updateBusinessProfileUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.businessId }, "Business profile updated");
    response.status(200).json(result);
  };

  public getHours = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getBusinessHoursUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public configureHours = async (request: Request, response: Response): Promise<void> => {
    const result = await this.configureBusinessHoursUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.businessId }, "Business hours configured");
    response.status(200).json(result);
  };

  public configureServiceWindows = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.configureBusinessServiceWindowsUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info(
      {
        businessId: result.businessId,
        activeServiceWindows: result.activeServiceWindows,
      },
      "Business service windows configured"
    );
    response.status(200).json(result);
  };

  public configureQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.configureQueueUseCase.execute(request.body);
    logger.info({ businessId: request.body.businessId }, "Queue configured");
    response.status(200).json(result);
  };
}
