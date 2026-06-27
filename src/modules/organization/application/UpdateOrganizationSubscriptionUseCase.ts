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
}

export interface UpdateOrganizationSubscriptionOutput {
  subscription: Subscription;
}

/**
 * Changes the active plan for an Organization (HU-2.5.4). Blocks downgrades
 * that would leave existing Business above the new plan's limit instead of
 * deleting data automatically; the caller decides what to do with the
 * excess (e.g. ask the account to remove a Business first).
 *
 * Not exposed over HTTP yet: there is no billing/self-service flow in the
 * MVP. This is a domain-level building block for when Backoffice or billing
 * needs to change a plan.
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
        "SUBSCRIPTION_DOWNGRADE_BLOCKED",
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
