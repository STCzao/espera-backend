import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";

import type { IUserRepo } from "../domain/IUserRepo";
import { GoogleOAuthService } from "../infrastructure/GoogleOAuthService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const registerBusinessWithGoogleSchema = z.object({
  code: z.string().min(1, "Google authorization code is required."),
  state: z.string().min(1, "Google OAuth state is required."),
  businessName: z.string().trim().min(2, "Business name is required.").max(120),
  businessSlug: z.string().trim().min(3, "Business slug must be at least 3 characters.").max(80),
  categoryId: z.string().uuid("Invalid category id."),
  address: z.string().trim().min(5).max(200).optional(),
});

export type RegisterBusinessWithGoogleInput = z.infer<
  typeof registerBusinessWithGoogleSchema
>;

export interface RegisterBusinessWithGoogleOutput {
  status: "pending_approval" | "existing_account";
  email: string;
  userId?: string;
  businessId?: string;
}

export class RegisterBusinessWithGoogleUseCase
  implements
    UseCase<
      RegisterBusinessWithGoogleInput,
      RegisterBusinessWithGoogleOutput
    >
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly googleOAuthService = new GoogleOAuthService(),
  ) {}

  public async execute(
    input: RegisterBusinessWithGoogleInput,
  ): Promise<RegisterBusinessWithGoogleOutput> {
    const parsed = registerBusinessWithGoogleSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const { code, businessName, businessSlug, categoryId, address } = parsed.data;

    const existingBusiness = await this.businessRepo.findBySlug(businessSlug);
    if (existingBusiness) {
      throw AppError.conflict("Business slug already in use.", "BUSINESS_SLUG_IN_USE");
    }

    const profile = await this.googleOAuthService.exchangeCodeForProfile(code);

    if (!profile.emailVerified) {
      throw AppError.forbidden(
        "Google account email must be verified.",
        "GOOGLE_EMAIL_NOT_VERIFIED",
      );
    }

    const existingUser = await this.userRepo.findByEmail(profile.email);
    // Returning a semantic status allows the frontend to branch into the
    // existing-account flow without relying on message parsing.
    if (existingUser) {
      return {
        status: "existing_account",
        email: existingUser.email,
      };
    }

    const user = await this.userRepo.save({
      id: randomUUID(),
      email: profile.email,
      firstName: profile.firstName || "Google",
      lastName: profile.lastName || "User",
      role: "business_admin",
      approvalStatus: "pending",
      authProvider: "google",
      googleId: profile.googleId,
      isEmailVerified: true,
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

      return {
        status: "pending_approval",
        email: user.email,
        userId: user.id,
        businessId: business.id,
      };
    } catch {
      await this.userRepo.delete(user.id);
      throw AppError.internal(
        "Failed to register business account with Google. Please try again.",
      );
    }
  }
}
