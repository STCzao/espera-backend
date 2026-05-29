import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";

export interface LogoutInput {
  refreshToken: string;
}

export class LogoutUseCase implements UseCase<LogoutInput, void> {
  public constructor(
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
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
    const session = await this.refreshSessionRepo.findByTokenHash(hash);
    // Idempotent: if the token is already gone, logout is already effective.
    if (!session || session.revokedAt) {
      return;
    }

    await this.refreshSessionRepo.revokeById(session.id);
  }
}
