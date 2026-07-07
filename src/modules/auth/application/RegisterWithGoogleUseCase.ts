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

const registerWithGoogleSchema = z.object({
  code: z.string().min(1, "Google authorization code is required."),
  state: z.string().min(1, "Google OAuth state is required."),
});

export type RegisterWithGoogleInput = z.infer<typeof registerWithGoogleSchema>;

export interface RegisterWithGoogleOutput {
  accessToken: string;
  refreshToken: string;
}

export class RegisterWithGoogleUseCase
  implements UseCase<RegisterWithGoogleInput, RegisterWithGoogleOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly tokenService = new JWTTokenService(),
    private readonly googleOAuthService = new GoogleOAuthService(),
  ) {}

  public async execute(input: RegisterWithGoogleInput): Promise<RegisterWithGoogleOutput> {
    const parsed = registerWithGoogleSchema.safeParse(input);
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
    if (existing) {
      throw AppError.conflict(
        "An account already exists for this Google email. Please sign in instead.",
        "EMAIL_ALREADY_REGISTERED",
      );
    }

    const user = await this.userRepo.save({
      id: randomUUID(),
      email: profile.email,
      firstName: profile.firstName || "Google",
      lastName: profile.lastName || "User",
      role: "user",
      approvalStatus: "approved",
      authProvider: "google",
      googleId: profile.googleId,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { token, hash } = this.tokenService.generateRefreshToken();
    await this.refreshSessionRepo.save({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hash,
      expiresAt: this.tokenService.getRefreshTokenExpiryDate(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      accessToken: this.tokenService.generateAccessToken(user),
      refreshToken: token,
    };
  }
}
