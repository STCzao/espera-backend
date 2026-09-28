import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription } from "../domain/Subscription";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  cancelledByUserId: z.string().uuid("Invalid reviewer id."),
  reason:           z.string().trim().min(1, "Cancellation reason is required.").max(500),
});

export type CancelOrganizationSubscriptionInput = z.infer<typeof schema>;

const TERMINAL_STATUSES: Subscription["status"][] = ["cancelled", "expired"];

/**
 * Manually cancels a Subscription (no self-service billing in the MVP —
 * the Espera team cancels on the account's behalf, e.g. after a refund or
 * a non-renewal request received outside the system).
 */
export class CancelOrganizationSubscriptionUseCase
  implements UseCase<CancelOrganizationSubscriptionInput, Subscription>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: CancelOrganizationSubscriptionInput): Promise<Subscription> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const subscription = await this.subscriptionRepo.findByOrganizationId(parsed.data.organizationId);
    if (!subscription) throw AppError.notFound("Subscription not found.", "SUBSCRIPTION_NOT_FOUND");

    if (TERMINAL_STATUSES.includes(subscription.status)) {
      throw AppError.conflict(
        "Subscription is already in a terminal state.",
        "SUBSCRIPTION_ALREADY_CANCELLED",
      );
    }

    return this.subscriptionRepo.save({
      ...subscription,
      status: "cancelled",
      cancelledByUserId: parsed.data.cancelledByUserId,
      cancellationReason: parsed.data.reason,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
