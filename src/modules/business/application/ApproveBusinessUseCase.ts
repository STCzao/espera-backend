import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import { sendBusinessWelcomeEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

export interface ApproveBusinessInput {
  businessId: string;
}

export interface ApproveBusinessOutput {
  businessId: string;
  approvalStatus: "approved";
}

export class ApproveBusinessUseCase
  implements UseCase<ApproveBusinessInput, ApproveBusinessOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: ApproveBusinessInput): Promise<ApproveBusinessOutput> {
    const business = await this.businessRepo.findById(input.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    const approvedBusiness = await this.businessRepo.save({
      ...business,
      approvalStatus: "approved",
    });

    const owner = await this.userRepo.findById(approvedBusiness.ownerUserId);
    if (owner) {
      try {
        await sendBusinessWelcomeEmail(owner.email, owner.firstName);
      } catch (error) {
        // Approval is the source of truth; notification delivery is best-effort.
        logger.error(
          { error, businessId: approvedBusiness.id, userId: owner.id },
          "Business approved but welcome email could not be sent",
        );
      }
    }

    return {
      businessId: approvedBusiness.id,
      approvalStatus: "approved",
    };
  }
}
