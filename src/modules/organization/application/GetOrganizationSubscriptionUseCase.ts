import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription } from "../domain/Subscription";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";
import { ResolveEffectiveSubscriptionStatusUseCase } from "./ResolveEffectiveSubscriptionStatusUseCase";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization id."),
});

export type GetOrganizationSubscriptionInput = z.infer<typeof schema>;

export class GetOrganizationSubscriptionUseCase
  implements UseCase<GetOrganizationSubscriptionInput, Subscription>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: GetOrganizationSubscriptionInput): Promise<Subscription> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
      .execute({ organizationId: parsed.data.organizationId });
    if (!subscription) throw AppError.notFound("Subscription not found.", "SUBSCRIPTION_NOT_FOUND");

    return subscription;
  }
}
