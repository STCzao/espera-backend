import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { GoogleOAuthService } from "../infrastructure/GoogleOAuthService";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const loginWithGoogleSchema = z.object({
  code: z.string().min(1, "Google authorization code is required."),
  state: z.string().min(1, "Google OAuth state is required."),
});

export type LoginWithGoogleInput = z.infer<typeof loginWithGoogleSchema>;

export interface LoginWithGoogleOutput {
  accessToken: string;
  refreshToken: string;
}

export class LoginWithGoogleUseCase
  implements UseCase<LoginWithGoogleInput, LoginWithGoogleOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly tokenService = new JWTTokenService(),
    private readonly googleOAuthService = new GoogleOAuthService(),
  ) {}

  public async execute(input: LoginWithGoogleInput): Promise<LoginWithGoogleOutput> {
    const parsed = loginWithGoogleSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const profile = await this.googleOAuthService.exchangeCodeForProfile(parsed.data.code);
    if (!profile.emailVerified) {
      throw AppError.forbidden(
        "Google account email must be verified.",
        "GOOGLE_EMAIL_NOT_VERIFIED",
      );
    }

    const existing = await this.userRepo.findByEmail(profile.email);
    let resolvedUser;

    if (!existing) {
      resolvedUser = await this.userRepo.save({
        id: randomUUID(),
        email: profile.email,
        firstName: profile.firstName || "Google",
        lastName: profile.lastName || "User",
        role: "user",
        approvalStatus: "approved",
        authProvider: "google",
        googleId: profile.googleId,
        isEmailVerified: true,
        isBlocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      if (existing.authProvider !== "google") {
        throw AppError.badRequest(
          "This account must sign in with email and password.",
          "AUTH_PROVIDER_MISMATCH",
        );
      }

      if (existing.googleId && existing.googleId !== profile.googleId) {
        throw AppError.unauthorized("Invalid Google account.", "GOOGLE_ACCOUNT_MISMATCH");
      }

      if (existing.role === "business_admin" && existing.approvalStatus === "rejected") {
        throw AppError.forbidden(
          "Your account approval request was rejected.",
          "ACCOUNT_REJECTED",
        );
      }

      resolvedUser = existing.googleId
        ? existing
        : await this.userRepo.save({ ...existing, googleId: profile.googleId });
    }

    const { token, hash } = this.tokenService.generateRefreshToken();
    await this.refreshSessionRepo.save({
      id: randomUUID(),
      userId: resolvedUser.id,
      tokenHash: hash,
      expiresAt: this.tokenService.getRefreshTokenExpiryDate(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      accessToken: this.tokenService.generateAccessToken(resolvedUser),
      refreshToken: token,
    };
  }
}
