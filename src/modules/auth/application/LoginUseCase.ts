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
  // Caller's network address (request.ip). Optional so callers without one
  // (scripts, tests) still work; they all share the "unknown" client bucket.
  ipAddress: z.string().max(64).optional(),
});

// Failed logins are counted twice, on purpose:
//  - per (email, IP): 5 strikes lock *that client* out of that account. A
//    third party who types someone's email wrong only locks themselves out;
//    if the lock were per email alone, anyone could keep a victim (or the
//    super admin) permanently locked out just by failing on purpose.
//  - per email across all IPs, with a much higher ceiling: still stops a
//    guesser who rotates IPs, without being cheap to abuse.
const ACCOUNT_WIDE_MAX_FAILED_ATTEMPTS = 30;

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

  private async recordFailure(
    clientIdentity: string,
    accountIdentity: string,
    blockDurationSeconds?: number,
  ): Promise<void> {
    await Promise.all([
      recordFailedLoginAttempt(clientIdentity, blockDurationSeconds),
      recordFailedLoginAttempt(accountIdentity, blockDurationSeconds, ACCOUNT_WIDE_MAX_FAILED_ATTEMPTS),
    ]);
  }

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
    const clientIdentity = `${email}|${parsed.data.ipAddress ?? "unknown"}`;
    const accountIdentity = `account:${email}`;

    const [clientStatus, accountStatus] = await Promise.all([
      getLoginAttemptStatus(clientIdentity),
      getLoginAttemptStatus(accountIdentity),
    ]);
    const isBlocked = [clientStatus, accountStatus].some(
      (status) => status.blockedUntil && status.blockedUntil.getTime() > Date.now(),
    );
    if (isBlocked) {
      throw AppError.tooManyRequests(
        "Too many failed login attempts. Please try again later.",
        "LOGIN_TEMPORARILY_BLOCKED",
      );
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user?.passwordHash) {
      await this.recordFailure(clientIdentity, accountIdentity);
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
      await this.recordFailure(clientIdentity, accountIdentity, blockDurationSeconds);
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

    // Only this client's strikes are cleared: the account-wide counter keeps
    // running so a successful login can't be used to reset an IP-rotating guesser.
    await resetLoginAttemptStatus(clientIdentity);

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
