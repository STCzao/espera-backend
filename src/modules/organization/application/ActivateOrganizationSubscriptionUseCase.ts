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

const ACTIVATABLE_STATUSES: Subscription["status"][] = ["pending", "trial"];

/**
 * Manually marks a Subscription active once the Espera team confirms
 * payment out-of-band (there is no payment gateway in the MVP). Only makes
 * sense from "pending" (never paid yet) or "trial" (paid before it ends).
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
        "Only a pending or trial subscription can be activated.",
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
