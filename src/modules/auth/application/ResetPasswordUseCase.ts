import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const resetPasswordSchema = z
  .object({
    token: z.string({ required_error: "Token is required." }).min(1, "Token is required."),
    password: z
      .string({ required_error: "Password is required." })
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must not exceed 72 characters.")
      .regex(
        passwordRegex,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number."
      ),
    confirmPassword: z
      .string({ required_error: "Password confirmation is required." })
      .min(1, "Password confirmation is required.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export interface ResetPasswordOutput {
  message: string;
}

export class ResetPasswordUseCase
  implements UseCase<ResetPasswordInput, ResetPasswordOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
  ) {}

  public async execute(input: ResetPasswordInput): Promise<ResetPasswordOutput> {
    const parsed = resetPasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const { token, password } = parsed.data;

    const user = await this.userRepo.findByPasswordResetToken(token);
    if (!user) {
      throw AppError.badRequest("Invalid or expired password reset link.");
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry.getTime() < Date.now()) {
      throw AppError.badRequest("Invalid or expired password reset link.");
    }

    if (user.passwordResetUsedAt) {
      throw AppError.badRequest("Invalid or expired password reset link.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Password resets revoke every active refresh session to protect the account
    // if the previous password or session cookies were compromised.
    await this.refreshSessionRepo.revokeAllByUserId(user.id);

    await this.userRepo.save({
      ...user,
      passwordHash,
      passwordResetToken: undefined,
      passwordResetExpiry: undefined,
      passwordResetUsedAt: new Date()
    });

    return {
      message: "Password updated successfully."
    };
  }
}
