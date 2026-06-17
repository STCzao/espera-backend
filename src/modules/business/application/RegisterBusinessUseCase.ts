import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import type { IGeocodingService } from "../domain/IGeocodingService";
import { GoogleMapsGeocodingService } from "../infrastructure/GoogleMapsGeocodingService";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const registerBusinessSchema = z.object({
  name: z.string().trim().min(2, "Business name is required.").max(120),
  slug: z.string().trim().min(3, "Business slug must be at least 3 characters.").max(80),
  categoryId: z.string().uuid("Invalid category id."),
  address: z.string().trim().min(5, "Business address is required.").max(200),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

export interface RegisterBusinessOutput {
  businessId: string;
}

export class RegisterBusinessUseCase
  implements UseCase<RegisterBusinessInput, RegisterBusinessOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly geocodingService: IGeocodingService = new GoogleMapsGeocodingService(),
  ) {}

  public async execute(input: RegisterBusinessInput): Promise<RegisterBusinessOutput> {
    const parsed = registerBusinessSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const existingBusiness = await this.businessRepo.findBySlug(parsed.data.slug);
    if (existingBusiness) {
      throw AppError.conflict("Business slug already in use.", "BUSINESS_SLUG_IN_USE");
    }

    const user = await this.userRepo.findById(parsed.data.ownerUserId);
    if (!user) {
      throw AppError.notFound("User not found.", "OWNER_NOT_FOUND");
    }

    if (user.role === "employee") {
      throw AppError.forbidden(
        "Employee accounts cannot register businesses.",
        "EMPLOYEE_CANNOT_CREATE_BUSINESS",
      );
    }

    const requiresBusinessAdminPromotion =
      user.role !== "business_admin" || user.approvalStatus === "rejected";

    try {
      if (requiresBusinessAdminPromotion) {
        // Existing accounts can start the business onboarding flow by creating a business.
        await this.userRepo.save({
          ...user,
          role: "business_admin",
          approvalStatus: "pending",
        });
      }

      // Maps is a later discovery concern, so geocoding enriches the record when available
      // but does not block the business profile from saving its textual address.
      const coordinates = await this.geocodingService.geocode(parsed.data.address);

      const business = await this.businessRepo.save({
        id: randomUUID(),
        name: parsed.data.name,
        slug: parsed.data.slug,
        categoryId: parsed.data.categoryId,
        address: parsed.data.address,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        listingStatus: "draft",
        activeServiceWindows: 1,
        ownerUserId: parsed.data.ownerUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        businessId: business.id,
      };
    } catch {
      if (requiresBusinessAdminPromotion) {
        await this.userRepo.save(user);
      }

      throw AppError.internal(
        "Failed to create business. Please try again.",
        "BUSINESS_REGISTRATION_FAILED",
      );
    }
  }
}
