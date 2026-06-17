import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { ConfigureBusinessHoursUseCase } from "../application/ConfigureBusinessHoursUseCase";
import { ConfigureQueueUseCase } from "../application/ConfigureQueueUseCase";
import { ConfigureBusinessServiceWindowsUseCase } from "../application/ConfigureBusinessServiceWindowsUseCase";
import { GenerateBusinessQrPngUseCase } from "../application/GenerateBusinessQrPngUseCase";
import { GetBusinessCategoryConfigUseCase } from "../application/GetBusinessCategoryConfigUseCase";
import { GetBusinessQrCodeUseCase } from "../application/GetBusinessQrCodeUseCase";
import { GetBusinessHoursUseCase } from "../application/GetBusinessHoursUseCase";
import { RegenerateBusinessQrCodeUseCase } from "../application/RegenerateBusinessQrCodeUseCase";
import { RegisterBusinessUseCase } from "../application/RegisterBusinessUseCase";
import { UpdateBusinessOperationalStatusUseCase } from "../application/UpdateBusinessOperationalStatusUseCase";
import { UpdateBusinessProfileUseCase } from "../application/UpdateBusinessProfileUseCase";

export class BusinessController {
  public constructor(
    private readonly registerBusinessUseCase = new RegisterBusinessUseCase(),
    private readonly configureQueueUseCase = new ConfigureQueueUseCase(),
    private readonly updateBusinessProfileUseCase = new UpdateBusinessProfileUseCase(),
    private readonly configureBusinessHoursUseCase = new ConfigureBusinessHoursUseCase(),
    private readonly getBusinessHoursUseCase = new GetBusinessHoursUseCase(),
    private readonly configureBusinessServiceWindowsUseCase = new ConfigureBusinessServiceWindowsUseCase(),
    private readonly getBusinessQrCodeUseCase = new GetBusinessQrCodeUseCase(),
    private readonly regenerateBusinessQrCodeUseCase = new RegenerateBusinessQrCodeUseCase(),
    private readonly generateBusinessQrPngUseCase = new GenerateBusinessQrPngUseCase(),
    private readonly updateBusinessOperationalStatusUseCase = new UpdateBusinessOperationalStatusUseCase(),
    private readonly getBusinessCategoryConfigUseCase = new GetBusinessCategoryConfigUseCase()
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

  public getCategoryConfig = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.getBusinessCategoryConfigUseCase.execute({
      categoryId: String(request.params.categoryId),
    });
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

  public updateOperationalStatus = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.updateBusinessOperationalStatusUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info(
      {
        businessId: result.businessId,
        operationalStatus: result.operationalStatus,
      },
      "Business operational status updated"
    );
    response.status(200).json(result);
  };

  public getQrCode = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.getBusinessQrCodeUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public regenerateQrCode = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.regenerateBusinessQrCodeUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.businessId }, "Business QR regenerated");
    response.status(201).json(result);
  };

  public downloadQrPng = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.generateBusinessQrPngUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`
    );
    response.status(200).send(result.buffer);
  };

  public configureQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.configureQueueUseCase.execute(request.body);
    logger.info({ businessId: request.body.businessId }, "Queue configured");
    response.status(200).json(result);
  };
}
