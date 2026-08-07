import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { PLAN_LIMITS } from "@modules/organization/public-api";
import type { ISubscriptionRepo } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo } from "@modules/organization/public-api";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

// Absolute sanity ceiling for the input, regardless of plan — the actual
// per-plan limit (checked below, after resolving the Subscription) is
// almost always lower than this. Reuses Premium's cap, the highest tier,
// as the single source of truth instead of a second hardcoded number.
const MAX_ACTIVE_SERVICE_WINDOWS = PLAN_LIMITS.premium.maxServiceWindowsPerQueue;

const configureBusinessServiceWindowsSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  activeServiceWindows: z
    .number({
      required_error: "Active service windows are required.",
      invalid_type_error: "Active service windows must be a number.",
    })
    .int("Active service windows must be an integer.")
    .min(0, "Active service windows cannot be negative.")
    .max(
      MAX_ACTIVE_SERVICE_WINDOWS,
      `Active service windows must not exceed ${MAX_ACTIVE_SERVICE_WINDOWS}.`,
    ),
});

export type ConfigureBusinessServiceWindowsInput = z.infer<
  typeof configureBusinessServiceWindowsSchema
>;

export interface ConfigureBusinessServiceWindowsOutput {
  businessId: string;
  activeServiceWindows: number;
  attentionAvailable: boolean;
}

export class ConfigureBusinessServiceWindowsUseCase
  implements
    UseCase<
      ConfigureBusinessServiceWindowsInput,
      ConfigureBusinessServiceWindowsOutput
    >
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(
    input: ConfigureBusinessServiceWindowsInput,
  ): Promise<ConfigureBusinessServiceWindowsOutput> {
    const parsed = configureBusinessServiceWindowsSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    if (business.status !== "approved") {
      throw AppError.conflict(
        "This business is not currently operating.",
        "BUSINESS_NOT_OPERATING",
      );
    }

    const subscription = await this.subscriptionRepo.findByOrganizationId(business.organizationId);
    const plan = subscription?.plan ?? "basic";
    const limit = PLAN_LIMITS[plan].maxServiceWindowsPerQueue;
    if (parsed.data.activeServiceWindows > limit) {
      throw AppError.forbidden(
        `Your plan allows up to ${limit} service window(s) per queue.`,
        "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
      );
    }

    const updatedBusiness = await this.businessRepo.save({
      ...business,
      activeServiceWindows: parsed.data.activeServiceWindows,
      updatedAt: new Date(),
    });

    return {
      businessId: updatedBusiness.id,
      activeServiceWindows: updatedBusiness.activeServiceWindows,
      attentionAvailable: updatedBusiness.activeServiceWindows > 0,
    };
  }
}
