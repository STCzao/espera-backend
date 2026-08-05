import type { UseCase } from "../../../shared/kernel/UseCase";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription } from "../domain/Subscription";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

export interface ResolveEffectiveSubscriptionStatusInput {
  organizationId: string;
}

export type ResolveEffectiveSubscriptionStatusOutput = Subscription | null;

/**
 * Reconciles a Subscription's status against the current time before
 * returning it — there is no scheduler/cron in this MVP (OutboxProcessor is
 * still a stub), so nothing moves "trial" to "expired" on its own once
 * trialEndsAt passes. Every place that needs to know whether an
 * Organization can operate should go through this instead of reading
 * ISubscriptionRepo directly, so a stale "trial" never gets treated as live.
 *
 * Persists the transition the first time it's observed (not just an
 * in-memory reinterpretation) so anyone reading the Subscription afterwards
 * — including this same use case next time — sees "expired" too.
 */
export class ResolveEffectiveSubscriptionStatusUseCase
  implements UseCase<ResolveEffectiveSubscriptionStatusInput, ResolveEffectiveSubscriptionStatusOutput>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(
    input: ResolveEffectiveSubscriptionStatusInput,
  ): Promise<ResolveEffectiveSubscriptionStatusOutput> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(input.organizationId);
    if (!subscription) return null;

    const trialExpired = subscription.status === "trial"
      && subscription.trialEndsAt !== null
      && subscription.trialEndsAt.getTime() <= Date.now();
    if (!trialExpired) return subscription;

    return this.subscriptionRepo.save({
      ...subscription,
      status: "expired",
      updatedAt: new Date(),
    });
  }
}
