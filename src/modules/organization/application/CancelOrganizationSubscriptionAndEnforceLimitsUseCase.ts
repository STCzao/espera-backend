import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { EnforceQueueLimitsForOrganizationUseCase } from "@modules/queue/public-api";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription } from "../domain/Subscription";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";
import { CancelOrganizationSubscriptionUseCase } from "./CancelOrganizationSubscriptionUseCase";
import type { CancelOrganizationSubscriptionInput } from "./CancelOrganizationSubscriptionUseCase";

export type CancelOrganizationSubscriptionAndEnforceLimitsInput = CancelOrganizationSubscriptionInput;

export interface CancelOrganizationSubscriptionAndEnforceLimitsOutput {
  subscription: Subscription;
  deactivatedQueueIds: string[];
  deactivatedServiceWindowIds: string[];
}

/**
 * Cancels a Subscription and immediately restricts the account to Basic
 * plan limits — previously two calls orchestrated ad hoc in
 * OrganizationController, with no recovery if enforcement failed after the
 * cancellation had already committed (the Subscription stayed "cancelled"
 * while Pro/Premium-level Queues/ServiceWindows kept running indefinitely).
 *
 * Not a DB transaction: neither CancelOrganizationSubscriptionUseCase nor
 * EnforceQueueLimitsForOrganizationUseCase accepts an externally supplied
 * tx (same constraint as SuspendReportedUseCase — see its doc comment).
 * Instead, a retry is made safe: EnforceQueueLimitsForOrganizationUseCase is
 * naturally idempotent (it always re-derives "what's active now" and trims
 * to the limit, with no guard to trip), and a Subscription that's already
 * "cancelled" from a prior attempt is treated as that attempt's expected
 * result instead of tripping CancelOrganizationSubscriptionUseCase's own
 * "already in a terminal state" guard.
 */
export class CancelOrganizationSubscriptionAndEnforceLimitsUseCase
  implements
    UseCase<
      CancelOrganizationSubscriptionAndEnforceLimitsInput,
      CancelOrganizationSubscriptionAndEnforceLimitsOutput
    >
{
  public constructor(
    private readonly cancelOrganizationSubscriptionUseCase: CancelOrganizationSubscriptionUseCase = new CancelOrganizationSubscriptionUseCase(),
    private readonly enforceQueueLimitsForOrganizationUseCase: EnforceQueueLimitsForOrganizationUseCase = new EnforceQueueLimitsForOrganizationUseCase(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(
    input: CancelOrganizationSubscriptionAndEnforceLimitsInput,
  ): Promise<CancelOrganizationSubscriptionAndEnforceLimitsOutput> {
    let subscription: Subscription;

    try {
      subscription = await this.cancelOrganizationSubscriptionUseCase.execute(input);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "SUBSCRIPTION_ALREADY_CANCELLED") {
        throw error;
      }

      const existing = await this.subscriptionRepo.findByOrganizationId(input.organizationId);
      if (!existing || existing.status !== "cancelled") {
        // Genuinely "expired" (the other terminal status sharing this same
        // error code) or no subscription at all — not the retry case this
        // guards, so the original error still applies.
        throw error;
      }
      subscription = existing;
    }

    const enforced = await this.enforceQueueLimitsForOrganizationUseCase.execute({
      organizationId: input.organizationId,
      limit: PLAN_LIMITS.basic,
    });

    return {
      subscription,
      deactivatedQueueIds: enforced.deactivatedQueueIds,
      deactivatedServiceWindowIds: enforced.deactivatedServiceWindowIds,
    };
  }
}
