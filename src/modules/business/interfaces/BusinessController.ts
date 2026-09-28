import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { CreateQueueUseCase, ListBusinessQueuesUseCase, ToggleQueueUseCase } from "@modules/queue/public-api";
import { ConfigureBusinessHoursUseCase } from "../application/ConfigureBusinessHoursUseCase";
import { GenerateBusinessQrPngUseCase } from "../application/GenerateBusinessQrPngUseCase";
import { GetBusinessCategoriesUseCase } from "../application/GetBusinessCategoriesUseCase";
import { GetBusinessCategoryConfigUseCase } from "../application/GetBusinessCategoryConfigUseCase";
import { GetBusinessQrCodeUseCase } from "../application/GetBusinessQrCodeUseCase";
import { GetBusinessHoursUseCase } from "../application/GetBusinessHoursUseCase";
import { ListMyBusinessesUseCase } from "../application/ListMyBusinessesUseCase";
import { RegenerateBusinessQrCodeUseCase } from "../application/RegenerateBusinessQrCodeUseCase";
import { RegisterBusinessUseCase } from "../application/RegisterBusinessUseCase";
import { UpdateBusinessOperationalStatusUseCase } from "../application/UpdateBusinessOperationalStatusUseCase";
import { UpdateBusinessProfileUseCase } from "../application/UpdateBusinessProfileUseCase";

/**
 * A Business's own profile, hours, QR code, operational status, and
 * queues — the "owner manages their own business" surface. Platform/admin
 * actions live in BusinessAdminController, employee management in
 * BusinessEmployeeController; this file used to hold all three (397
 * lines/28 methods) before the split.
 */
export class BusinessController {
  public constructor(
    private readonly registerBusinessUseCase = new RegisterBusinessUseCase(),
    private readonly createQueueUseCase = new CreateQueueUseCase(),
    private readonly listBusinessQueuesUseCase = new ListBusinessQueuesUseCase(),
    private readonly toggleQueueUseCase = new ToggleQueueUseCase(),
    private readonly updateBusinessProfileUseCase = new UpdateBusinessProfileUseCase(),
    private readonly configureBusinessHoursUseCase = new ConfigureBusinessHoursUseCase(),
    private readonly getBusinessHoursUseCase = new GetBusinessHoursUseCase(),
    private readonly getBusinessQrCodeUseCase = new GetBusinessQrCodeUseCase(),
    private readonly regenerateBusinessQrCodeUseCase = new RegenerateBusinessQrCodeUseCase(),
    private readonly generateBusinessQrPngUseCase = new GenerateBusinessQrPngUseCase(),
    private readonly updateBusinessOperationalStatusUseCase = new UpdateBusinessOperationalStatusUseCase(),
    private readonly getBusinessCategoriesUseCase = new GetBusinessCategoriesUseCase(),
    private readonly getBusinessCategoryConfigUseCase = new GetBusinessCategoryConfigUseCase(),
    private readonly listMyBusinessesUseCase = new ListMyBusinessesUseCase(),
  ) {}

  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerBusinessUseCase.execute({
      ...request.body,
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessSlug: result.businessSlug }, "Business registered");
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

  public listCategories = async (
    _request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.getBusinessCategoriesUseCase.execute();
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

  public listMine = async (request: Request, response: Response): Promise<void> => {
    const result = await this.listMyBusinessesUseCase.execute({
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public createQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createQueueUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.businessId, queueId: result.id }, "Queue created");
    response.status(201).json(result);
  };

  public listQueues = async (request: Request, response: Response): Promise<void> => {
    const result = await this.listBusinessQueuesUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public toggleQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.toggleQueueUseCase.execute({
      queueId: String(request.params.queueId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info({ queueId: result.id, isActive: result.isActive }, "Queue toggled");
    response.status(200).json(result);
  };
}
