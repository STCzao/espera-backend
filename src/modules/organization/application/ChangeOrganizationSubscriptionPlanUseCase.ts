import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo, IServiceWindowRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo, PostgresServiceWindowRepo } from "@modules/queue/public-api";
import type { SubscriptionPlan } from "../domain/Subscription";
import { UpdateOrganizationSubscriptionUseCase } from "./UpdateOrganizationSubscriptionUseCase";
import type { UpdateOrganizationSubscriptionOutput } from "./UpdateOrganizationSubscriptionUseCase";

export interface ChangeOrganizationSubscriptionPlanInput {
  organizationId: string;
  newPlan: SubscriptionPlan;
}

export type ChangeOrganizationSubscriptionPlanOutput = UpdateOrganizationSubscriptionOutput;

/**
 * Aggregation root for PATCH .../subscription/plan (HU-2.5.4): computes the
 * business/queue/window usage this Organization currently has — crossing
 * the business and queue modules, which UpdateOrganizationSubscriptionUseCase
 * deliberately doesn't depend on (see that use case's own doc comment) — and
 * hands it over to decide whether the new plan actually fits.
 *
 * This used to live directly in OrganizationController.changeSubscriptionPlan
 * — the one controller method in this codebase that queried repos and
 * computed business logic itself instead of delegating to a use case, which
 * also meant this aggregation had no test coverage of its own.
 */
export class ChangeOrganizationSubscriptionPlanUseCase
  implements UseCase<ChangeOrganizationSubscriptionPlanInput, ChangeOrganizationSubscriptionPlanOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly updateOrganizationSubscriptionUseCase: UpdateOrganizationSubscriptionUseCase = new UpdateOrganizationSubscriptionUseCase(),
  ) {}

  public async execute(
    input: ChangeOrganizationSubscriptionPlanInput,
  ): Promise<ChangeOrganizationSubscriptionPlanOutput> {
    const [currentBusinessCount, businesses] = await Promise.all([
      this.businessRepo.countByOrganizationId(input.organizationId),
      this.businessRepo.findByOrganizationId(input.organizationId),
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

    return this.updateOrganizationSubscriptionUseCase.execute({
      organizationId: input.organizationId,
      newPlan: input.newPlan,
      currentBusinessCount,
      maxActiveQueuesPerBusiness,
      maxActiveWindowsPerQueue,
    });
  }
}
