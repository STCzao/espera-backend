import { z } from "zod";

import type { IRefreshSessionRepo } from "@modules/auth/public-api";
import { PostgresRefreshSessionRepo } from "@modules/auth/public-api";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const revokeBusinessEmployeeSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  userId: z.string().uuid("Invalid employee user id."),
});

export type RevokeBusinessEmployeeInput = z.infer<
  typeof revokeBusinessEmployeeSchema
>;

export interface RevokeBusinessEmployeeOutput {
  businessId: string;
  userId: string;
  revoked: true;
}

export class RevokeBusinessEmployeeUseCase
  implements UseCase<RevokeBusinessEmployeeInput, RevokeBusinessEmployeeOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
  ) {}

  public async execute(
    input: RevokeBusinessEmployeeInput,
  ): Promise<RevokeBusinessEmployeeOutput> {
    const parsed = revokeBusinessEmployeeSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to revoke employees for this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    if (business.ownerUserId === parsed.data.userId) {
      throw AppError.badRequest(
        "The business owner cannot be revoked as an employee.",
        "OWNER_CANNOT_BE_REVOKED",
      );
    }

    const revokedEmployee = await this.employeeRepo.revokeByBusinessAndUser(
      business.id,
      parsed.data.userId,
      new Date(),
    );
    if (!revokedEmployee) {
      throw AppError.notFound("Employee not found.", "EMPLOYEE_NOT_FOUND");
    }

    // Revocation removes future refresh capability immediately. Existing
    // short-lived access tokens may remain valid until their natural expiry.
    await this.refreshSessionRepo.revokeAllByUserId(parsed.data.userId);

    return {
      businessId: business.id,
      userId: parsed.data.userId,
      revoked: true,
    };
  }
}
