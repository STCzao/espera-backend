import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendVerificationEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const resendVerificationSchema = z.object({
  email: z
    .string()
    .email("Invalid token.")
    .transform((value) => value.trim().toLowerCase())
});

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export interface ResendVerificationOutput {
  message: string;
}

export class ResendVerificationUseCase
  implements UseCase<ResendVerificationInput, ResendVerificationOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo()
  ) {}

  /**
   * Resends a verification email to an existing unverified user.
   * Refreshes the verification token and expiry before sending the new email.
   *
   * A missing account and an already-verified one return the exact same
   * generic message as a real resend — same account-enumeration defense
   * RequestPasswordResetUseCase already uses, applied here too: neither
   * "this email isn't registered" nor "this email is already verified"
   * should be distinguishable from "we sent it."
   */
  public async execute(input: ResendVerificationInput): Promise<ResendVerificationOutput> {
    const parsed = resendVerificationSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid token.");
    }

    const genericResponse: ResendVerificationOutput = {
      message: "If the email needs verification, we sent a new link.",
    };

    const user = await this.userRepo.findByEmail(parsed.data.email);

    if (!user || user.isEmailVerified) {
      return genericResponse;
    }

    // Cooldown prevents email flooding and repeated token churn for the same account.
    if (
      user.lastVerificationSentAt &&
      Date.now() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw AppError.tooManyRequests(
        "Please wait 5 minutes before requesting another email."
      );
    }

    const verificationToken = randomUUID();
    const verificationDate = new Date();
    const verificationExpiry = new Date(verificationDate.getTime() + VERIFICATION_EXPIRY_MS);

    const updatedUser = await this.userRepo.save({
      ...user,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
      lastVerificationSentAt: verificationDate,
      updatedAt: new Date()
    });

    try {
      await sendVerificationEmail(updatedUser.email, verificationToken);
    } catch {
      throw AppError.internal("Failed to send verification email. Please try again.");
    }

    return genericResponse;
  }
}
