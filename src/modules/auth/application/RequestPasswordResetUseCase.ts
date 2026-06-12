import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendPasswordResetEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const requestPasswordResetSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .email("Invalid email.")
        .max(254, "Email must not exceed 254 characters.")
        .transform((value) => value.toLowerCase()),
    ),
});

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

export interface RequestPasswordResetOutput {
  message: string;
}

export class RequestPasswordResetUseCase implements UseCase<
  RequestPasswordResetInput,
  RequestPasswordResetOutput
> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(
    input: RequestPasswordResetInput,
  ): Promise<RequestPasswordResetOutput> {
    const parsed = requestPasswordResetSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const { email } = parsed.data;
    const user = await this.userRepo.findByEmail(email);

    if (!user || user.authProvider !== "local") {
      return {
        message: "If the email is registered, we sent a password recovery link.",
      };
    }

    const requestedAt = new Date();
    const resetToken = randomUUID();
    const resetExpiry = new Date(
      requestedAt.getTime() + PASSWORD_RESET_EXPIRY_MS,
    );
    const previousResetToken = user.passwordResetToken;
    const previousResetExpiry = user.passwordResetExpiry;
    const previousResetUsedAt = user.passwordResetUsedAt;

    await this.userRepo.save({
      ...user,
      passwordResetToken: resetToken,
      passwordResetExpiry: resetExpiry,
      passwordResetUsedAt: undefined,
    });

    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch {
      await this.userRepo.save({
        ...user,
        passwordResetToken: previousResetToken,
        passwordResetExpiry: previousResetExpiry,
        passwordResetUsedAt: previousResetUsedAt
      });
      throw AppError.internal(
        "Failed to send password recovery email. Please try again.",
      );
    }

    return {
      message: "If the email is registered, we sent a password recovery link.",
    };
  }
}
