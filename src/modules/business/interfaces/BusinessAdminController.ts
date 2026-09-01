import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import type { SocketIOEmitter } from "@modules/queue/public-api";
import { ApproveBusinessUseCase } from "../application/ApproveBusinessUseCase";
import { GetBusinessReviewDetailUseCase } from "../application/GetBusinessReviewDetailUseCase";
import { GetPlatformMetricsUseCase } from "../application/GetPlatformMetricsUseCase";
import { ListAllBusinessesUseCase } from "../application/ListAllBusinessesUseCase";
import { ListPendingBusinessesUseCase } from "../application/ListPendingBusinessesUseCase";
import { ReactivateBusinessUseCase } from "../application/ReactivateBusinessUseCase";
import { RejectBusinessUseCase } from "../application/RejectBusinessUseCase";
import { SuspendBusinessUseCase } from "../application/SuspendBusinessUseCase";

/**
 * Platform/backoffice actions on a Business (review queue, approve/reject,
 * suspend/reactivate, platform-wide metrics and directory) — split out of
 * BusinessController, which had grown to cover profile, employees, and
 * admin concerns in one 397-line/28-method file.
 */
export class BusinessAdminController {
  public constructor(
    private readonly emitter: SocketIOEmitter | null = null,
    private readonly listPendingBusinessesUseCase = new ListPendingBusinessesUseCase(),
    private readonly approveBusinessUseCase = new ApproveBusinessUseCase(),
    private readonly rejectBusinessUseCase = new RejectBusinessUseCase(),
    private readonly suspendBusinessUseCase = new SuspendBusinessUseCase(undefined, undefined, undefined, undefined, undefined, emitter),
    private readonly reactivateBusinessUseCase = new ReactivateBusinessUseCase(),
    private readonly getPlatformMetricsUseCase = new GetPlatformMetricsUseCase(),
    private readonly getBusinessReviewDetailUseCase = new GetBusinessReviewDetailUseCase(),
    private readonly listAllBusinessesUseCase = new ListAllBusinessesUseCase()
  ) {}

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

  public getPlatformMetrics = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const result = await this.getPlatformMetricsUseCase.execute({
      fromDate: typeof request.query.fromDate === "string" ? request.query.fromDate : undefined,
      toDate:   typeof request.query.toDate === "string" ? request.query.toDate : undefined,
    });
    response.status(200).json(result);
  };

  public listAll = async (request: Request, response: Response): Promise<void> => {
    const query = request.query;
    const asString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
    const asNumber = (value: unknown): number | undefined => typeof value === "string" ? Number(value) : undefined;

    const result = await this.listAllBusinessesUseCase.execute({
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
