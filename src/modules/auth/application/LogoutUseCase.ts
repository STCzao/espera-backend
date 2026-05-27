import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface LogoutInput {
  refreshToken: string;
}

export class LogoutUseCase implements UseCase<LogoutInput, void> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly tokenService = new JWTTokenService()
  ) {}

  /**
   * Invalidates the current refresh token so the session cannot be refreshed again.
   * Remains idempotent when the token was already removed or never existed.
   */
  public async execute(input: LogoutInput): Promise<void> {
    if (!input.refreshToken) {
      throw AppError.badRequest("Invalid token.");
    }

    const hash = this.tokenService.hashRefreshToken(input.refreshToken);
    const user = await this.userRepo.findByRefreshTokenHash(hash);
    // Idempotent: if the token is already gone, logout is already effective.
    if (!user) {
      return;
    }

    await this.userRepo.save({
      ...user,
      refreshTokenHash: undefined
    });
  }
}
