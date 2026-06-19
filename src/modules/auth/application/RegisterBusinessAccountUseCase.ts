import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendVerificationEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const registerBusinessAccountSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Invalid email.")
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z
      .string({ required_error: "Password is required." })
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must not exceed 72 characters.")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number.",
      ),
    confirmPassword: z
      .string({ required_error: "Password confirmation is required." })
      .min(1, "Password confirmation is required."),
    firstName: z.string().trim().min(2).max(50),
    lastName: z.string().trim().min(2).max(50),
    businessName: z.string().trim().min(2, "Business name is required.").max(120),
    businessSlug: z.string().trim().min(3).max(80),
    categoryId: z.string().uuid("Invalid category id."),
    address: z.string().trim().min(5).max(200).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterBusinessAccountInput = z.infer<
  typeof registerBusinessAccountSchema
>;

export interface RegisterBusinessAccountOutput {
  userId: string;
  businessId: string;
  approvalStatus: "pending";
}

// Business accounts can verify their email before platform approval, but panel access
// remains blocked until Espera approves the account.

export class RegisterBusinessAccountUseCase implements UseCase<
  RegisterBusinessAccountInput,
  RegisterBusinessAccountOutput
> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(
    input: RegisterBusinessAccountInput,
  ): Promise<RegisterBusinessAccountOutput> {
    const parsed = registerBusinessAccountSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const {
      email,
      password,
      firstName,
      lastName,
      businessName,
      businessSlug,
      categoryId,
      address,
    } = parsed.data;

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw AppError.conflict("Email already in use.");
    }

    const existingBusiness = await this.businessRepo.findBySlug(businessSlug);
    if (existingBusiness) {
      throw AppError.conflict("Business slug already in use.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomUUID();
    const verificationDate = new Date();
    const verificationExpiry = new Date(
      verificationDate.getTime() + 24 * 60 * 60 * 1000,
    );
    let createdBusinessId: string | null = null;

    const user = await this.userRepo.save({
      id: randomUUID(),
      email,
      firstName,
      lastName,
      passwordHash,
      role: "business_admin",
      approvalStatus: "pending",
      authProvider: "local",
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
      lastVerificationSentAt: verificationDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      const business = await this.businessRepo.save({
        id: randomUUID(),
        name: businessName,
        slug: businessSlug,
        categoryId,
        address,
        listingStatus: "draft",
        activeServiceWindows: 1,
        operationalStatus: "normal",
        ownerUserId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createdBusinessId = business.id;

      await sendVerificationEmail(user.email, verificationToken);

      return {
        userId: user.id,
        businessId: business.id,
        approvalStatus: "pending",
      };
    } catch {
      if (createdBusinessId) {
        await this.businessRepo.delete(createdBusinessId);
      }

      await this.userRepo.delete(user.id);
      throw AppError.internal(
        "Failed to register business account. Please try again.",
      );
    }
  }
}
