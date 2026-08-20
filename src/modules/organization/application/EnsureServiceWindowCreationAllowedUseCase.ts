import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";
import { ResolveEffectiveSubscriptionStatusUseCase } from "./ResolveEffectiveSubscriptionStatusUseCase";

export interface EnsureServiceWindowCreationAllowedInput {
  organizationId: string;
  currentServiceWindowCountForQueue: number;
}

export type EnsureServiceWindowCreationAllowedOutput = void;

/**
 * Enforces the plan grid for how many ServiceWindow a single Queue can have
 * at once (basic = 1, i.e. a single counter with no parallel attention).
 */
export class EnsureServiceWindowCreationAllowedUseCase
  implements UseCase<EnsureServiceWindowCreationAllowedInput, EnsureServiceWindowCreationAllowedOutput>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: EnsureServiceWindowCreationAllowedInput): Promise<void> {
    const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
      .execute({ organizationId: input.organizationId });

    if (subscription && (subscription.status === "cancelled" || subscription.status === "expired")) {
      throw AppError.forbidden(
        "Your organization's subscription is not active.",
        "SUBSCRIPTION_INACTIVE",
      );
    }

    const plan = subscription?.plan ?? "basic";
    const limit = PLAN_LIMITS[plan];

    if (input.currentServiceWindowCountForQueue >= limit.maxServiceWindowsPerQueue) {
      throw AppError.forbidden(
        `Your plan allows up to ${limit.maxServiceWindowsPerQueue} service window(s) per queue.`,
        "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
      );
    }
  }
}
