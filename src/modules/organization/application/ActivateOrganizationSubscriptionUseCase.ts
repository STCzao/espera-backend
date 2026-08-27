import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription } from "../domain/Subscription";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  activatedByUserId: z.string().uuid("Invalid reviewer id."),
});

export type ActivateOrganizationSubscriptionInput = z.infer<typeof schema>;

const ACTIVATABLE_STATUSES: Subscription["status"][] = ["pending", "trial", "cancelled", "expired"];

/**
 * Manually marks a Subscription active once the Espera team confirms
 * payment out-of-band (there is no payment gateway in the MVP). Covers both
 * a first activation ("pending"/"trial" — never paid, or paid before the
 * trial ends) and a renewal ("cancelled"/"expired" — the account is paying
 * again after lapsing). Renewal used to be impossible: this use case
 * refused anything but pending/trial, and nothing else in the codebase set
 * status back to "active" either — a lapsed account had no way back in.
 * cancelledByUserId/cancellationReason/cancelledAt are left untouched as
 * history, not cleared, even on a renewal.
 */
export class ActivateOrganizationSubscriptionUseCase
  implements UseCase<ActivateOrganizationSubscriptionInput, Subscription>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: ActivateOrganizationSubscriptionInput): Promise<Subscription> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const subscription = await this.subscriptionRepo.findByOrganizationId(parsed.data.organizationId);
    if (!subscription) throw AppError.notFound("Subscription not found.", "SUBSCRIPTION_NOT_FOUND");

    if (!ACTIVATABLE_STATUSES.includes(subscription.status)) {
      throw AppError.conflict(
        "This subscription is already active.",
        "SUBSCRIPTION_CANNOT_BE_ACTIVATED",
      );
    }

    return this.subscriptionRepo.save({
      ...subscription,
      status: "active",
      activatedByUserId: parsed.data.activatedByUserId,
      activatedAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
