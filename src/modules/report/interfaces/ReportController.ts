import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { CreateReportUseCase } from "../application/CreateReportUseCase";
import { DismissReportUseCase } from "../application/DismissReportUseCase";
import type { ListReportsInput } from "../application/ListReportsUseCase";
import { ListReportsUseCase } from "../application/ListReportsUseCase";
import { ResolveReportUseCase } from "../application/ResolveReportUseCase";
import { SuspendReportedUseCase } from "../application/SuspendReportedUseCase";

export class ReportController {
  public constructor(
    private readonly createReportUseCase = new CreateReportUseCase(),
    private readonly listReportsUseCase = new ListReportsUseCase(),
    private readonly resolveReportUseCase = new ResolveReportUseCase(),
    private readonly dismissReportUseCase = new DismissReportUseCase(),
    private readonly suspendReportedUseCase = new SuspendReportedUseCase()
  ) {}

  public create = async (request: Request, response: Response): Promise<void> => {
    const result = await this.createReportUseCase.execute({
      ...request.body,
      reportedByUserId: request.user?.id ?? "",
    });
    logger.info({ reportId: result.id, reportedType: result.reportedType }, "Report filed");
    response.status(201).json(result);
  };

  public list = async (request: Request, response: Response): Promise<void> => {
    const result = await this.listReportsUseCase.execute({
      status:       typeof request.query.status === "string" ? request.query.status : undefined,
      reportedType: typeof request.query.reportedType === "string" ? request.query.reportedType : undefined,
    } as ListReportsInput);
    response.status(200).json(result);
  };

  public resolve = async (request: Request, response: Response): Promise<void> => {
    const result = await this.resolveReportUseCase.execute({
      reportId:         String(request.params.reportId),
      reviewedByUserId: request.user?.id ?? "",
      note:             request.body?.note,
    });
    logger.info({ reportId: result.id }, "Report resolved");
    response.status(200).json(result);
  };

  public dismiss = async (request: Request, response: Response): Promise<void> => {
    const result = await this.dismissReportUseCase.execute({
      reportId:         String(request.params.reportId),
      reviewedByUserId: request.user?.id ?? "",
      note:             request.body?.note,
    });
    logger.info({ reportId: result.id }, "Report dismissed");
    response.status(200).json(result);
  };

  public suspend = async (request: Request, response: Response): Promise<void> => {
    const result = await this.suspendReportedUseCase.execute({
      reportId:         String(request.params.reportId),
      reviewedByUserId: request.user?.id ?? "",
      note:             request.body?.note,
    });
    logger.info({ reportId: result.id }, "Reported entity suspended");
    response.status(200).json(result);
  };
}
