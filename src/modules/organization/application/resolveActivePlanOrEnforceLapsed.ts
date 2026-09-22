import { AppError } from "@shared/kernel/AppError";
import { EnforceQueueLimitsForOrganizationUseCase } from "@modules/queue/public-api";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { SubscriptionPlan } from "../domain/Subscription";
import { ResolveEffectiveSubscriptionStatusUseCase } from "./ResolveEffectiveSubscriptionStatusUseCase";

/**
 * Shared by EnsureQueueCreationAllowedUseCase and
 * EnsureServiceWindowCreationAllowedUseCase: resolves the Organization's
 * effective plan, or — if its subscription has lapsed (cancelled/expired) —
 * runs the same Basic-level cleanup an explicit cancellation gets and
 * throws SUBSCRIPTION_INACTIVE.
 *
 * A lapsed trial never goes through
 * OrganizationController.cancelSubscription (nothing calls it —
 * ResolveEffectiveSubscriptionStatusUseCase flips the status lazily, on
 * read, with no explicit action attached), so a creation attempt is the
 * first place that reliably notices "this org no longer has a paid plan"
 * for every Business under it.
 */
export const resolveActivePlanOrEnforceLapsed = async (
  organizationId: string,
  subscriptionRepo: ISubscriptionRepo,
  enforceQueueLimitsForOrganizationUseCase: EnforceQueueLimitsForOrganizationUseCase,
): Promise<SubscriptionPlan> => {
  const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(subscriptionRepo).execute({
    organizationId,
  });

  if (subscription && (subscription.status === "cancelled" || subscription.status === "expired")) {
    await enforceQueueLimitsForOrganizationUseCase.execute({
      organizationId,
      limit: PLAN_LIMITS.basic,
    });

    throw AppError.forbidden(
      "Your organization's subscription is not active.",
      "SUBSCRIPTION_INACTIVE",
    );
  }

  return subscription?.plan ?? "basic";
};
