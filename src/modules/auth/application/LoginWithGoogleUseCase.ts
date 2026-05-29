import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { GoogleOAuthService } from "../infrastructure/GoogleOAuthService";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const loginWithGoogleSchema = z.object({
  code: z.string().min(1, "Google authorization code is required."),
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

    const user = await this.userRepo.findByEmail(profile.email);
    if (!user) {
      throw AppError.notFound("No account was found for this Google email.", "ACCOUNT_NOT_FOUND");
    }

    if (user.authProvider !== "google") {
      throw AppError.badRequest(
        "This account must sign in with email and password.",
        "AUTH_PROVIDER_MISMATCH",
      );
    }

    if (user.googleId && user.googleId !== profile.googleId) {
      throw AppError.unauthorized("Invalid Google account.", "GOOGLE_ACCOUNT_MISMATCH");
    }

    if (user.role === "business_admin" && user.approvalStatus === "pending") {
      throw AppError.forbidden(
        "Your account is still under review.",
        "ACCOUNT_PENDING_REVIEW",
      );
    }

    if (user.role === "business_admin" && user.approvalStatus === "rejected") {
      throw AppError.forbidden(
        "Your account approval request was rejected.",
        "ACCOUNT_REJECTED",
      );
    }

    const { token, hash } = this.tokenService.generateRefreshToken();
    await this.userRepo.save({
      ...user,
      refreshTokenHash: hash,
      googleId: user.googleId ?? profile.googleId,
    });

    return {
      accessToken: this.tokenService.generateAccessToken(user),
      refreshToken: token,
    };
  }
}
