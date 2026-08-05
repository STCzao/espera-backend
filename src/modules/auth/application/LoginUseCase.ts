import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import {
  SUPER_ADMIN_BLOCK_DURATION_SECONDS,
  getLoginAttemptStatus,
  recordFailedLoginAttempt,
  resetLoginAttemptStatus,
} from "@shared/infrastructure/loginAttemptTracker";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const loginSchema = z.object({
  email: z.string().email("Invalid email."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase implements UseCase<LoginInput, LoginOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly tokenService = new JWTTokenService(),
  ) {}

  /**
   * Authenticates a user and issues a new access token plus refresh token.
   * Persists only the refresh token hash, never the plaintext token.
   */
  public async execute(input: LoginInput): Promise<LoginOutput> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const loginAttemptStatus = await getLoginAttemptStatus(email);
    if (
      loginAttemptStatus.blockedUntil &&
      loginAttemptStatus.blockedUntil.getTime() > Date.now()
    ) {
      throw AppError.tooManyRequests(
        "Too many failed login attempts. Please try again later.",
        "LOGIN_TEMPORARILY_BLOCKED",
      );
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user?.passwordHash) {
      await recordFailedLoginAttempt(email);
      throw AppError.unauthorized("Invalid credentials.");
    }

    const passwordMatches = await bcrypt.compare(
      parsed.data.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      const blockDurationSeconds = user.role === "super_admin"
        ? SUPER_ADMIN_BLOCK_DURATION_SECONDS
        : undefined;
      await recordFailedLoginAttempt(email, blockDurationSeconds);
      throw AppError.unauthorized("Invalid credentials.");
    }

    if (user.isBlocked) {
      throw AppError.forbidden("Your account has been blocked.", "ACCOUNT_BLOCKED");
    }

    if (user.role === "business_admin" && user.approvalStatus === "rejected") {
      throw AppError.forbidden(
        "Your account approval request was rejected.",
        "ACCOUNT_REJECTED",
      );
    }

    if (!user.isEmailVerified) {
      throw AppError.forbidden(
        "You must verify your email before logging in.",
        "EMAIL_NOT_VERIFIED",
      );
    }

    await resetLoginAttemptStatus(email);

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
