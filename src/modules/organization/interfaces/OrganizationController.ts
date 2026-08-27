import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo, IServiceWindowRepo } from "@modules/queue/public-api";
import { EnforceQueueLimitsForOrganizationUseCase, PostgresQueueRepo, PostgresServiceWindowRepo } from "@modules/queue/public-api";
import { ActivateOrganizationSubscriptionUseCase } from "../application/ActivateOrganizationSubscriptionUseCase";
import { ApproveOrganizationUseCase } from "../application/ApproveOrganizationUseCase";
import { CancelOrganizationSubscriptionUseCase } from "../application/CancelOrganizationSubscriptionUseCase";
import { PLAN_LIMITS } from "../domain/PlanLimits";
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
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly enforceQueueLimitsForOrganizationUseCase = new EnforceQueueLimitsForOrganizationUseCase(),
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
    const organizationId = String(request.params.organizationId);
    const result = await this.cancelOrganizationSubscriptionUseCase.execute({
      organizationId,
      cancelledByUserId: request.user?.id ?? "",
      reason:            String(request.body.reason),
    });

    // A cancelled account no longer has a paid plan — restrict it to what
    // Basic allows instead of leaving Pro/Premium-level queues/windows
    // running indefinitely for free. Deactivates in excess, doesn't delete;
    // the owner picks what comes back (via the existing toggles) if they
    // renew — see EnforceQueueLimitsForOrganizationUseCase.
    const enforced = await this.enforceQueueLimitsForOrganizationUseCase.execute({
      organizationId,
      limit: PLAN_LIMITS.basic,
    });

    logger.info(
      {
        organizationId: result.organizationId,
        deactivatedQueues: enforced.deactivatedQueueIds.length,
        deactivatedServiceWindows: enforced.deactivatedServiceWindowIds.length,
      },
      "Subscription cancelled",
    );
    response.status(200).json(result);
  };

  public changeSubscriptionPlan = async (request: Request, response: Response): Promise<void> => {
    const organizationId = String(request.params.organizationId);

    const [currentBusinessCount, businesses] = await Promise.all([
      this.businessRepo.countByOrganizationId(organizationId),
      this.businessRepo.findByOrganizationId(organizationId),
    ]);

    const queuesByBusiness = await Promise.all(
      businesses.map((business) => this.queueRepo.findByBusinessId(business.id)),
    );
    const maxActiveQueuesPerBusiness = Math.max(
      0,
      ...queuesByBusiness.map((queues) => queues.filter((q) => q.isActive).length),
    );

    const allQueues = queuesByBusiness.flat();
    const windowsByQueue = await Promise.all(
      allQueues.map((queue) => this.windowRepo.findByQueueId(queue.id)),
    );
    const maxActiveWindowsPerQueue = Math.max(
      0,
      ...windowsByQueue.map((windows) => windows.filter((w) => w.isActive).length),
    );

    const result = await this.updateOrganizationSubscriptionUseCase.execute({
      organizationId,
      newPlan: request.body.plan,
      currentBusinessCount,
      maxActiveQueuesPerBusiness,
      maxActiveWindowsPerQueue,
    });
    logger.info({ organizationId, plan: result.subscription.plan }, "Subscription plan changed");
    response.status(200).json(result.subscription);
  };
}
