import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";
import { PLAN_LIMITS } from "../domain/PlanLimits";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

export interface EnsureBusinessCreationAllowedInput {
  organizationId: string;
  currentBusinessCount: number;
}

export type EnsureBusinessCreationAllowedOutput = void;

/**
 * Enforces the plan grid for how many Business an Organization can have
 * active at once (HU-2.5.4). Called by RegisterBusinessUseCase before
 * persisting a new Business.
 */
export class EnsureBusinessCreationAllowedUseCase
  implements UseCase<EnsureBusinessCreationAllowedInput, EnsureBusinessCreationAllowedOutput>
{
  public constructor(
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: EnsureBusinessCreationAllowedInput): Promise<void> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(input.organizationId);
    const plan = subscription?.plan ?? "basic";
    const limit = PLAN_LIMITS[plan];

    if (input.currentBusinessCount >= limit.maxBusinesses) {
      throw AppError.forbidden(
        `Your plan allows up to ${limit.maxBusinesses} business(es).`,
        "PLAN_BUSINESS_LIMIT_REACHED",
      );
    }
  }
}
