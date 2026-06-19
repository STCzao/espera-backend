import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { domainEventBus } from "@shared/EventBus";
import { sendVerificationEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const nameRegex = /^[\p{L}\s'-]+$/u;

const registerSchema = z
  .object({
    email: z
      .string({ required_error: "Email is required." })
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .email("Invalid email.")
          .max(254, "Email must not exceed 254 characters.")
          .transform((value) => value.toLowerCase())
      ),
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
      .min(1, "Password confirmation is required."),
    firstName: z
      .string({ required_error: "First name is required." })
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(2, "First name must be at least 2 characters.")
          .max(50, "First name must not exceed 50 characters.")
          .regex(nameRegex, "First name can only contain letters.")
      ),
    lastName: z
      .string({ required_error: "Last name is required." })
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(2, "Last name must be at least 2 characters.")
          .max(50, "Last name must not exceed 50 characters.")
          .regex(nameRegex, "Last name can only contain letters.")
      )
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

// Verification links remain valid for 24 hours to balance usability and account safety.
const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type RegisterInput = z.infer<typeof registerSchema>;

export interface RegisterOutput {
  userId: string;
}

export class RegisterUseCase implements UseCase<RegisterInput, RegisterOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo()
  ) {}

  /**
   * Registers a new user and starts the email verification flow.
   * Sends a verification email after persistence succeeds.
   * Rolls back the created user if the email cannot be sent.
   */
  public async execute(input: RegisterInput): Promise<RegisterOutput> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const { email, password, firstName, lastName } = parsed.data;

    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw AppError.conflict("Email already in use.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomUUID();
    const verificationDate = new Date();
    const verificationExpiry = new Date(verificationDate.getTime() + VERIFICATION_EXPIRY_MS);

    const user = await this.userRepo.save({
      id: randomUUID(),
      email,
      firstName,
      lastName,
      passwordHash,
      role: "user",
      approvalStatus: "approved",
      authProvider: "local",
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
      lastVerificationSentAt: verificationDate,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch {
      // Rollback: user was created but email failed, so remove the unverifiable account.
      await this.userRepo.delete(user.id);
      throw AppError.internal("Failed to send verification email. Please try again.");
    }

    domainEventBus.emit("user.registered", {
      userId: user.id,
      email: user.email
    });

    return {
      userId: user.id
    };
  }
}
