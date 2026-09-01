import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

export interface EnsureBusinessMembershipInput {
  businessId: string;
  userId: string;
}

export type EnsureBusinessMembershipOutput = void;

/**
 * Verifies the requesting user is either the owner of `businessId` or one
 * of its active employees. `authorize()` only proves the user's global
 * role (employee/business_admin) — role is a platform-wide grant, not
 * scoped to a specific business, so it can't prove *which* business the
 * user belongs to. Every operational queue use case (call next, attend,
 * cancel, redirect, mark no-show, create manual turn, and the read side —
 * list/status/metrics/history/windows) needs this on top of the role
 * check, or any employee of any business can reach into any other
 * business's queue by guessing/knowing its queueId or turnId — this is the
 * shared guard that closes that gap.
 *
 * No Zod schema here on purpose, matching the other internal `Ensure*`
 * checks (e.g. EnsureQueueCreationAllowedUseCase): this is always called by
 * another use case, never directly from a controller, so the id format was
 * already validated at the HTTP boundary that owns that responsibility.
 */
export class EnsureBusinessMembershipUseCase
  implements UseCase<EnsureBusinessMembershipInput, EnsureBusinessMembershipOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
  ) {}

  public async execute(input: EnsureBusinessMembershipInput): Promise<void> {
    const business = await this.businessRepo.findById(input.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.ownerUserId === input.userId) return;

    const employee = await this.employeeRepo.findActiveByBusinessAndUser(
      input.businessId,
      input.userId,
    );
    if (!employee) {
      throw AppError.forbidden(
        "You do not have access to this business.",
        "BUSINESS_MEMBERSHIP_REQUIRED",
      );
    }
  }
}
