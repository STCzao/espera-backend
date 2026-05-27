import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface VerifyEmailInput {
  token: string;
}

export interface VerifyEmailOutput {
  message: string;
}

export class VerifyEmailUseCase
  implements UseCase<VerifyEmailInput, VerifyEmailOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo()
  ) {}

  /**
   * Verifies a user's email address using the stored verification token.
   * Clears verification fields once the email is confirmed.
   */
  public async execute(input: VerifyEmailInput): Promise<VerifyEmailOutput> {
    if (!input.token) {
      throw AppError.badRequest("Invalid verification token.");
    }

    const user = await this.userRepo.findByVerificationToken(input.token);

    if (!user) {
      throw AppError.badRequest("Invalid verification token.");
    }

    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw AppError.badRequest(
        "Verification token has expired. Please request a new one."
      );
    }

    await this.userRepo.save({
      ...user,
      isEmailVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpiry: undefined,
      updatedAt: new Date()
    });

    return { message: "Email verified successfully." };
  }
}
