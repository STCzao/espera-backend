import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import type { SocketIOEmitter } from "@modules/queue/public-api";
import { AcceptBusinessEmployeeInvitationUseCase } from "../application/AcceptBusinessEmployeeInvitationUseCase";
import { ApproveBusinessUseCase } from "../application/ApproveBusinessUseCase";
import { ConfigureBusinessHoursUseCase } from "../application/ConfigureBusinessHoursUseCase";
import { ConfigureQueueUseCase } from "../application/ConfigureQueueUseCase";
import { ConfigureBusinessServiceWindowsUseCase } from "../application/ConfigureBusinessServiceWindowsUseCase";
import { GenerateBusinessQrPngUseCase } from "../application/GenerateBusinessQrPngUseCase";
import { GetBusinessCategoriesUseCase } from "../application/GetBusinessCategoriesUseCase";
import { GetBusinessCategoryConfigUseCase } from "../application/GetBusinessCategoryConfigUseCase";
import { GetBusinessQrCodeUseCase } from "../application/GetBusinessQrCodeUseCase";
import { GetBusinessHoursUseCase } from "../application/GetBusinessHoursUseCase";
import { GetBusinessReviewDetailUseCase } from "../application/GetBusinessReviewDetailUseCase";
import { GetPlatformMetricsUseCase } from "../application/GetPlatformMetricsUseCase";
import { InviteBusinessEmployeeUseCase } from "../application/InviteBusinessEmployeeUseCase";
import { ListBusinessEmployeesUseCase } from "../application/ListBusinessEmployeesUseCase";
import { ListMyBusinessesUseCase } from "../application/ListMyBusinessesUseCase";
import { ListPendingBusinessesUseCase } from "../application/ListPendingBusinessesUseCase";
import { ReactivateBusinessUseCase } from "../application/ReactivateBusinessUseCase";
import { RegenerateBusinessQrCodeUseCase } from "../application/RegenerateBusinessQrCodeUseCase";
import { RegisterBusinessUseCase } from "../application/RegisterBusinessUseCase";
import { RejectBusinessUseCase } from "../application/RejectBusinessUseCase";
import { RevokeBusinessEmployeeUseCase } from "../application/RevokeBusinessEmployeeUseCase";
import { SuspendBusinessUseCase } from "../application/SuspendBusinessUseCase";
import { UpdateBusinessOperationalStatusUseCase } from "../application/UpdateBusinessOperationalStatusUseCase";
import { UpdateBusinessProfileUseCase } from "../application/UpdateBusinessProfileUseCase";

export class BusinessController {
  public constructor(
    private readonly emitter: SocketIOEmitter | null = null,
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
    private readonly getBusinessCategoriesUseCase = new GetBusinessCategoriesUseCase(),
    private readonly getBusinessCategoryConfigUseCase = new GetBusinessCategoryConfigUseCase(),
    private readonly inviteBusinessEmployeeUseCase = new InviteBusinessEmployeeUseCase(),
    private readonly listBusinessEmployeesUseCase = new ListBusinessEmployeesUseCase(),
    private readonly listMyBusinessesUseCase = new ListMyBusinessesUseCase(),
    private readonly acceptBusinessEmployeeInvitationUseCase = new AcceptBusinessEmployeeInvitationUseCase(),
    private readonly revokeBusinessEmployeeUseCase = new RevokeBusinessEmployeeUseCase(),
    private readonly listPendingBusinessesUseCase = new ListPendingBusinessesUseCase(),
    private readonly approveBusinessUseCase = new ApproveBusinessUseCase(),
    private readonly rejectBusinessUseCase = new RejectBusinessUseCase(),
    private readonly suspendBusinessUseCase = new SuspendBusinessUseCase(undefined, undefined, undefined, undefined, undefined, emitter),
    private readonly reactivateBusinessUseCase = new ReactivateBusinessUseCase(),
    private readonly getPlatformMetricsUseCase = new GetPlatformMetricsUseCase(),
    private readonly getBusinessReviewDetailUseCase = new GetBusinessReviewDetailUseCase()
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

  public inviteEmployee = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.inviteBusinessEmployeeUseCase.execute({
      ...request.body,
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    logger.info(
      { businessId: result.businessId, email: result.email },
      "Business employee invited"
    );
    response.status(201).json(result);
  };

  public listEmployees = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.listBusinessEmployeesUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
    });
    response.status(200).json(result);
  };

  public acceptEmployeeInvitation = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.acceptBusinessEmployeeInvitationUseCase.execute({
      ...request.body,
      token: String(request.params.token),
    });
    response.status(200).json(result);
  };

  public revokeEmployee = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.revokeBusinessEmployeeUseCase.execute({
      businessId: String(request.params.businessId),
      ownerUserId: request.user?.id ?? "",
      userId: String(request.params.userId),
    });
    logger.info(
      { businessId: result.businessId, userId: result.userId },
      "Business employee revoked"
    );
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

  public listPending = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.listPendingBusinessesUseCase.execute({
      organizationId: typeof request.query.organizationId === "string" ? request.query.organizationId : undefined,
      categoryId:     typeof request.query.categoryId === "string" ? request.query.categoryId : undefined,
      fromDate:       typeof request.query.fromDate === "string" ? request.query.fromDate : undefined,
      toDate:         typeof request.query.toDate === "string" ? request.query.toDate : undefined,
    });
    response.status(200).json(result);
  };

  public approve = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.approveBusinessUseCase.execute({
      businessId:       String(request.params.businessId),
      approvedByUserId: request.user?.id ?? "",
      note:             request.body?.note,
    });
    logger.info({ businessId: result.id }, "Business approved");
    response.status(200).json(result);
  };

  public getReviewDetail = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.getBusinessReviewDetailUseCase.execute({
      businessId: String(request.params.businessId),
    });
    response.status(200).json(result);
  };

  public reject = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.rejectBusinessUseCase.execute({
      businessId:       String(request.params.businessId),
      rejectedByUserId: request.user?.id ?? "",
      reason:           String(request.body.reason),
    });
    logger.info({ businessId: result.id }, "Business rejected");
    response.status(200).json(result);
  };

  public suspend = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.suspendBusinessUseCase.execute({
      businessId:        String(request.params.businessId),
      suspendedByUserId: request.user?.id ?? "",
      reason:            String(request.body.reason),
    });
    logger.info({ businessId: result.id }, "Business suspended");
    response.status(200).json(result);
  };

  public reactivate = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.reactivateBusinessUseCase.execute({
      businessId:          String(request.params.businessId),
      reactivatedByUserId: request.user?.id ?? "",
    });
    logger.info({ businessId: result.id }, "Business reactivated");
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

  public configureQueue = async (request: Request, response: Response): Promise<void> => {
    const result = await this.configureQueueUseCase.execute(request.body);
    logger.info({ businessId: request.body.businessId }, "Queue configured");
    response.status(200).json(result);
  };

  public getPlatformMetrics = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const query = request.query;
    const asString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    const asNumber = (value: unknown): number | undefined => typeof value === "string" ? Number(value) : undefined;

    const result = await this.getPlatformMetricsUseCase.execute({
      fromDate:           asString(query.fromDate),
      toDate:             asString(query.toDate),
      organizationId:     asString(query.organizationId),
      categoryId:         asString(query.categoryId),
      status:             asString(query.status) as never,
      subscriptionPlan:   asString(query.subscriptionPlan) as never,
      subscriptionStatus: asString(query.subscriptionStatus) as never,
      sortBy:             asString(query.sortBy) as never,
      sortDir:            asString(query.sortDir) as never,
      page:               asNumber(query.page),
      pageSize:           asNumber(query.pageSize),
    });
    response.status(200).json(result);
  };
}
