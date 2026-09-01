import { AppError } from "@shared/kernel/AppError";
import { EnforceQueueLimitsForOrganizationUseCase } from "@modules/queue/public-api";
import type { UseCase } from "../../../shared/kernel/UseCase";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";
import { ResolveEffectiveSubscriptionStatusUseCase } from "./ResolveEffectiveSubscriptionStatusUseCase";

export interface EnsureQueueCreationAllowedInput {
  organizationId: string;
  currentQueueCountForBusiness: number;
}

export type EnsureQueueCreationAllowedOutput = void;

/**
 * Enforces the plan grid for how many Queue a single Business can have
 * active at once (HU-2.5.4).
 *
 * Extension point for Épica 3: `Queue` has no Postgres persistence yet, so
 * the caller is responsible for counting active queues for the target
 * Business (e.g. `queueRepo.countActiveByBusinessId(businessId)`) and
 * passing it in. Once CreateQueueUseCase becomes real, call this use case
 * with that count before inserting the new Queue.
 */
export class EnsureQueueCreationAllowedUseCase
  implements UseCase<EnsureQueueCreationAllowedInput, EnsureQueueCreationAllowedOutput>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly enforceQueueLimitsForOrganizationUseCase: EnforceQueueLimitsForOrganizationUseCase = new EnforceQueueLimitsForOrganizationUseCase(),
  ) {}

  public async execute(input: EnsureQueueCreationAllowedInput): Promise<void> {
    const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
      .execute({ organizationId: input.organizationId });

    if (subscription && (subscription.status === "cancelled" || subscription.status === "expired")) {
      // A lapsed trial never goes through OrganizationController.cancelSubscription
      // (nothing calls it — ResolveEffectiveSubscriptionStatusUseCase flips the
      // status lazily, on read, with no explicit action attached). This is the
      // first place that reliably notices "this org no longer has a paid plan"
      // for every Business under it, so it's also where the same Basic-level
      // cleanup an explicit cancellation gets finally gets a chance to run.
      await this.enforceQueueLimitsForOrganizationUseCase.execute({
        organizationId: input.organizationId,
        limit: PLAN_LIMITS.basic,
      });

      throw AppError.forbidden(
        "Your organization's subscription is not active.",
        "SUBSCRIPTION_INACTIVE",
      );
    }

    const plan = subscription?.plan ?? "basic";
    const limit = PLAN_LIMITS[plan];

    if (input.currentQueueCountForBusiness >= limit.maxQueuesPerBusiness) {
      throw AppError.forbidden(
        `Your plan allows up to ${limit.maxQueuesPerBusiness} queue(s) per business.`,
        "PLAN_QUEUE_LIMIT_REACHED",
      );
    }
  }
}
