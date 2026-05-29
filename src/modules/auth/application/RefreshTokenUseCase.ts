import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenOutput {
  accessToken: string;
  refreshToken: string;
}

export class RefreshTokenUseCase
  implements UseCase<RefreshTokenInput, RefreshTokenOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly tokenService = new JWTTokenService()
  ) {}

  /**
   * Exchanges a valid refresh token for a new access token and rotated refresh token.
   * Rejects tokens that are missing from storage, expired by policy, or already replaced.
   */
  public async execute(input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    if (!input.refreshToken) {
      throw AppError.badRequest("Invalid token.");
    }

    const hash = this.tokenService.hashRefreshToken(input.refreshToken);
    const session = await this.refreshSessionRepo.findByTokenHash(hash);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw AppError.unauthorized("Invalid or expired token.");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw AppError.unauthorized("Invalid or expired token.");
    }

    // Rotate token on every use to reduce replay risk if an old token is leaked.
    const { token, hash: newHash } = this.tokenService.generateRefreshToken();
    await this.refreshSessionRepo.save({
      ...session,
      tokenHash: newHash,
      expiresAt: this.tokenService.getRefreshTokenExpiryDate(),
    });

    return {
      accessToken: this.tokenService.generateAccessToken(user),
      refreshToken: token
    };
  }
}
