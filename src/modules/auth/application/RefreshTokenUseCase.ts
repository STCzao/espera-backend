import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

// Hard ceiling on a login session's life. Each refresh slides the 30-day
// token expiry forward, so without this a session refreshed at least once a
// month would never expire, however old the original login is.
export const ABSOLUTE_SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;

// How long after a rotation the previous token still counts as "the other tab
// got there first" rather than a replay. Browser tabs share one cookie jar,
// so the retry after this conflict carries the freshly rotated token.
const ROTATION_RACE_GRACE_MS = 10_000;

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
    if (!session) {
      await this.rejectStaleToken(hash);
      throw AppError.unauthorized("Invalid or expired token.");
    }
    if (session.revokedAt || session.expiresAt < new Date()) {
      throw AppError.unauthorized("Invalid or expired token.");
    }

    const absoluteExpiry = new Date(session.createdAt.getTime() + ABSOLUTE_SESSION_MAX_MS);
    if (absoluteExpiry < new Date()) {
      await this.refreshSessionRepo.revokeById(session.id);
      throw AppError.unauthorized("Session expired. Please log in again.", "SESSION_EXPIRED");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw AppError.unauthorized("Invalid or expired token.");
    }

    // Direct check, not just reliance on BlockUserUseCase revoking sessions
    // at block time — a future path that flips isBlocked without also
    // revoking sessions shouldn't let a blocked user keep refreshing.
    if (user.isBlocked) {
      throw AppError.forbidden("Your account has been blocked.", "ACCOUNT_BLOCKED");
    }

    // Rotate token on every use to reduce replay risk if an old token is leaked.
    // Compare-and-swap on the hash that was just read: of two concurrent
    // refreshes with the same token exactly one wins.
    const { token, hash: newHash } = this.tokenService.generateRefreshToken();
    const slidingExpiry = this.tokenService.getRefreshTokenExpiryDate();
    const rotated = await this.refreshSessionRepo.rotate({
      sessionId: session.id,
      expectedTokenHash: hash,
      newTokenHash: newHash,
      newExpiresAt: slidingExpiry < absoluteExpiry ? slidingExpiry : absoluteExpiry,
      rotatedAt: new Date(),
    });
    if (!rotated) {
      throw AppError.conflict(
        "This session was just refreshed elsewhere. Retry with the current token.",
        "REFRESH_TOKEN_ROTATED",
      );
    }

    return {
      accessToken: this.tokenService.generateAccessToken(user),
      refreshToken: token
    };
  }

  /**
   * Called when no session holds this token any more. If some session held it
   * before its last rotation, the token was already used: right after the
   * rotation that's the benign two-tabs race (409, the client retries with
   * the new cookie); later it can only be a replay of a leaked token, so the
   * whole session is revoked and its legitimate owner has to log in again.
   */
  private async rejectStaleToken(hash: string): Promise<void> {
    const stale = await this.refreshSessionRepo.findByPreviousTokenHash(hash);
    if (!stale || stale.revokedAt) return;

    const rotatedAgoMs = stale.rotatedAt ? Date.now() - stale.rotatedAt.getTime() : Infinity;
    if (rotatedAgoMs <= ROTATION_RACE_GRACE_MS) {
      throw AppError.conflict(
        "This session was just refreshed elsewhere. Retry with the current token.",
        "REFRESH_TOKEN_ROTATED",
      );
    }

    await this.refreshSessionRepo.revokeById(stale.id);
  }
}
