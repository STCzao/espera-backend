import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { sendBusinessWelcomeEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface ApproveBusinessAccountInput {
  userId: string;
}

export interface ApproveBusinessAccountOutput {
  userId: string;
  approvalStatus: "approved";
}

export class ApproveBusinessAccountUseCase implements UseCase<
  ApproveBusinessAccountInput,
  ApproveBusinessAccountOutput
> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(
    input: ApproveBusinessAccountInput,
  ): Promise<ApproveBusinessAccountOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw AppError.notFound("User not found.");
    }

    if (user.role !== "business_admin") {
      throw AppError.badRequest(
        "Only business admin accounts can be approved.",
      );
    }

    const updatedUser = await this.userRepo.save({
      ...user,
      approvalStatus: "approved",
    });

    try {
      await sendBusinessWelcomeEmail(updatedUser.email, updatedUser.firstName);
    } catch (error) {
      // Approval is the source-of-truth business action, so email delivery is best-effort.
      logger.error(
        { error, userId: updatedUser.id },
        "Business account approved but welcome email could not be sent",
      );
    }

    return {
      userId: updatedUser.id,
      approvalStatus: "approved",
    };
  }
}
