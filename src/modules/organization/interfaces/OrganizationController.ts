import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { ApproveOrganizationUseCase } from "../application/ApproveOrganizationUseCase";
import { ListPendingOrganizationsUseCase } from "../application/ListPendingOrganizationsUseCase";
import { RejectOrganizationUseCase } from "../application/RejectOrganizationUseCase";
import { UpdateOrganizationUseCase } from "../application/UpdateOrganizationUseCase";

export class OrganizationController {
  public constructor(
    private readonly listPendingOrganizationsUseCase = new ListPendingOrganizationsUseCase(),
    private readonly approveOrganizationUseCase = new ApproveOrganizationUseCase(),
    private readonly rejectOrganizationUseCase = new RejectOrganizationUseCase(),
    private readonly updateOrganizationUseCase = new UpdateOrganizationUseCase()
  ) {}

  public listPending = async (_request: Request, response: Response): Promise<void> => {
    const result = await this.listPendingOrganizationsUseCase.execute();
    response.status(200).json(result);
  };

  public approve = async (request: Request, response: Response): Promise<void> => {
    const result = await this.approveOrganizationUseCase.execute({
      organizationId:   String(request.params.organizationId),
      approvedByUserId: request.user?.id ?? "",
    });
    logger.info({ organizationId: result.id }, "Organization approved");
    response.status(200).json(result);
  };

  public reject = async (request: Request, response: Response): Promise<void> => {
    const result = await this.rejectOrganizationUseCase.execute({
      organizationId:   String(request.params.organizationId),
      rejectedByUserId: request.user?.id ?? "",
      reason:           String(request.body.reason),
    });
    logger.info({ organizationId: result.id }, "Organization rejected");
    response.status(200).json(result);
  };

  public update = async (request: Request, response: Response): Promise<void> => {
    const result = await this.updateOrganizationUseCase.execute({
      organizationId:   String(request.params.organizationId),
      requestingUserId: request.user?.id ?? "",
      name:             request.body.name,
      legalId:          request.body.legalId,
    });
    logger.info({ organizationId: result.id }, "Organization updated");
    response.status(200).json(result);
  };
}
