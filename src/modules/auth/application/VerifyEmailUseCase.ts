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

  public async execute(input: VerifyEmailInput): Promise<VerifyEmailOutput> {
    if (!input.token) {
      throw AppError.badRequest("Token de verificación inválido.");
    }

    const user = await this.userRepo.findByVerificationToken(input.token);

    if (!user) {
      throw AppError.badRequest("Token de verificación inválido.");
    }

    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw AppError.badRequest("El token de verificación expiró. Solicitá uno nuevo.");
    }

    await this.userRepo.save({
      ...user,
      isEmailVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpiry: undefined,
      updatedAt: new Date()
    });

    return { message: "Email verificado correctamente." };
  }
}
