import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription, SubscriptionPlan } from "../domain/Subscription";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

export interface UpdateOrganizationSubscriptionInput {
  organizationId: string;
  newPlan: SubscriptionPlan;
  currentBusinessCount: number;
  // The highest count of *active* queues any single Business under this
  // Organization currently has, and the highest count of *active* service
  // windows any single Queue currently has — not a per-business/per-queue
  // breakdown, because PLAN_LIMITS applies the same ceiling to every
  // business/queue under the org, so only the worst offender matters for
  // the block/allow decision. The caller computes these (same pattern as
  // currentBusinessCount) so this use case stays decoupled from the
  // business/queue modules.
  maxActiveQueuesPerBusiness: number;
  maxActiveWindowsPerQueue: number;
}

export interface UpdateOrganizationSubscriptionOutput {
  subscription: Subscription;
}

/**
 * Changes the active plan for an Organization (HU-2.5.4). Blocks a
 * downgrade that would leave existing Businesses, Queues or ServiceWindows
 * above the new plan's limits instead of deactivating them automatically —
 * the account narrows down first (ToggleQueueUseCase /
 * ToggleServiceWindowUseCase already exist for that), then the downgrade
 * goes through. No auto-picking-for-the-owner: same reasoning as no_show
 * being an explicit action, not a side effect.
 *
 * Each of the three checks has its own error code
 * (SUBSCRIPTION_DOWNGRADE_BLOCKED_BUSINESSES/_QUEUES/_WINDOWS) instead of
 * sharing one — a caller that maps errors by code (not by parsing the
 * message) needs to tell the three apart to point the owner at the right
 * fix.
 *
 * Exposed at PATCH /organization/:organizationId/subscription/plan
 * (platform:manage_approvals only — no self-service billing in the MVP).
 */
export class UpdateOrganizationSubscriptionUseCase
  implements UseCase<UpdateOrganizationSubscriptionInput, UpdateOrganizationSubscriptionOutput>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(
    input: UpdateOrganizationSubscriptionInput,
  ): Promise<UpdateOrganizationSubscriptionOutput> {
    const existing = await this.subscriptionRepo.findByOrganizationId(input.organizationId);
    if (!existing) {
      throw AppError.notFound("Subscription not found.", "SUBSCRIPTION_NOT_FOUND");
    }

    const newLimit = PLAN_LIMITS[input.newPlan];
    if (input.currentBusinessCount > newLimit.maxBusinesses) {
      throw AppError.conflict(
        `Cannot downgrade to ${input.newPlan}: organization has more businesses than the new plan allows.`,
        "SUBSCRIPTION_DOWNGRADE_BLOCKED_BUSINESSES",
      );
    }
    if (input.maxActiveQueuesPerBusiness > newLimit.maxQueuesPerBusiness) {
      throw AppError.conflict(
        `Cannot downgrade to ${input.newPlan}: a business has more active queues than the new plan allows. Deactivate some first.`,
        "SUBSCRIPTION_DOWNGRADE_BLOCKED_QUEUES",
      );
    }
    if (input.maxActiveWindowsPerQueue > newLimit.maxServiceWindowsPerQueue) {
      throw AppError.conflict(
        `Cannot downgrade to ${input.newPlan}: a queue has more active service windows than the new plan allows. Deactivate some first.`,
        "SUBSCRIPTION_DOWNGRADE_BLOCKED_WINDOWS",
      );
    }

    const subscription = await this.subscriptionRepo.save({
      ...existing,
      plan: input.newPlan,
      updatedAt: new Date(),
    });

    return { subscription };
  }
}
