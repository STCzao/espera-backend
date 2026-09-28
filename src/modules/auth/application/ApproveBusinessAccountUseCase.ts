import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface ApproveBusinessAccountInput {
  userId: string;
}

export interface ApproveBusinessAccountOutput {
  userId: string;
  approvalStatus: "approved";
}

/**
 * Approves a business_admin's account (login gate only — clears a `pending`
 * or `rejected` approvalStatus so the account is in good standing).
 *
 * This is intentionally decoupled from commercial approval: whether the
 * user's Organization or any of their Business can operate is governed by
 * ApproveOrganizationUseCase / ApproveBusinessUseCase (backlog v2.4 —
 * two-level approval), not by this account-level gate.
 */
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
      isEmailVerified: true,
    });

    return {
      userId: updatedUser.id,
      approvalStatus: "approved",
    };
  }
}
