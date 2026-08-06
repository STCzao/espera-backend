import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import { ActivateOrganizationSubscriptionUseCase } from "../application/ActivateOrganizationSubscriptionUseCase";
import { ApproveOrganizationUseCase } from "../application/ApproveOrganizationUseCase";
import { CancelOrganizationSubscriptionUseCase } from "../application/CancelOrganizationSubscriptionUseCase";
import { GetOrganizationSubscriptionUseCase } from "../application/GetOrganizationSubscriptionUseCase";
import { ListPendingOrganizationsUseCase } from "../application/ListPendingOrganizationsUseCase";
import { RejectOrganizationUseCase } from "../application/RejectOrganizationUseCase";
import { UpdateOrganizationSubscriptionUseCase } from "../application/UpdateOrganizationSubscriptionUseCase";
import { UpdateOrganizationUseCase } from "../application/UpdateOrganizationUseCase";

export class OrganizationController {
  public constructor(
    private readonly listPendingOrganizationsUseCase = new ListPendingOrganizationsUseCase(),
    private readonly approveOrganizationUseCase = new ApproveOrganizationUseCase(),
    private readonly rejectOrganizationUseCase = new RejectOrganizationUseCase(),
    private readonly updateOrganizationUseCase = new UpdateOrganizationUseCase(),
    private readonly getOrganizationSubscriptionUseCase = new GetOrganizationSubscriptionUseCase(),
    private readonly activateOrganizationSubscriptionUseCase = new ActivateOrganizationSubscriptionUseCase(),
    private readonly cancelOrganizationSubscriptionUseCase = new CancelOrganizationSubscriptionUseCase(),
    private readonly updateOrganizationSubscriptionUseCase = new UpdateOrganizationSubscriptionUseCase(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo()
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
      categoryId:       request.body.categoryId,
    });
    logger.info({ organizationId: result.id }, "Organization updated");
    response.status(200).json(result);
  };

  public getSubscription = async (request: Request, response: Response): Promise<void> => {
    const result = await this.getOrganizationSubscriptionUseCase.execute({
      organizationId: String(request.params.organizationId),
    });
    response.status(200).json(result);
  };

  public activateSubscription = async (request: Request, response: Response): Promise<void> => {
    const result = await this.activateOrganizationSubscriptionUseCase.execute({
      organizationId:    String(request.params.organizationId),
      activatedByUserId: request.user?.id ?? "",
    });
    logger.info({ organizationId: result.organizationId }, "Subscription activated");
    response.status(200).json(result);
  };

  public cancelSubscription = async (request: Request, response: Response): Promise<void> => {
    const result = await this.cancelOrganizationSubscriptionUseCase.execute({
      organizationId:    String(request.params.organizationId),
      cancelledByUserId: request.user?.id ?? "",
      reason:            String(request.body.reason),
    });
    logger.info({ organizationId: result.organizationId }, "Subscription cancelled");
    response.status(200).json(result);
  };

  public changeSubscriptionPlan = async (request: Request, response: Response): Promise<void> => {
    const organizationId = String(request.params.organizationId);
    const currentBusinessCount = await this.businessRepo.countByOrganizationId(organizationId);
    const result = await this.updateOrganizationSubscriptionUseCase.execute({
      organizationId,
      newPlan: request.body.plan,
      currentBusinessCount,
    });
    logger.info({ organizationId, plan: result.subscription.plan }, "Subscription plan changed");
    response.status(200).json(result.subscription);
  };
}
