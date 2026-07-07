import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import {
  CreateOrganizationForOwnerUseCase,
  EnsureBusinessCreationAllowedUseCase,
} from "@modules/organization/public-api";
import { generateUniqueSlug } from "../../../shared/utils/slug";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IBusinessCategoryRepo } from "../domain/IBusinessCategoryRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import type { IGeocodingService } from "../domain/IGeocodingService";
import { PostgresBusinessCategoryRepo } from "../infrastructure/PostgresBusinessCategoryRepo";
import { GoogleMapsGeocodingService } from "../infrastructure/GoogleMapsGeocodingService";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const registerBusinessSchema = z.object({
  name: z.string().trim().min(2, "Business name is required.").max(120),
  categoryId: z.string().uuid("Invalid category id."),
  address: z.string().trim().min(5, "Business address is required.").max(200),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

export interface RegisterBusinessOutput {
  businessId: string;
  businessSlug: string;
  status: "pending";
}

export class RegisterBusinessUseCase
  implements UseCase<RegisterBusinessInput, RegisterBusinessOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly geocodingService: IGeocodingService = new GoogleMapsGeocodingService(),
    private readonly createOrganizationForOwnerUseCase: CreateOrganizationForOwnerUseCase = new CreateOrganizationForOwnerUseCase(),
    private readonly ensureBusinessCreationAllowedUseCase: EnsureBusinessCreationAllowedUseCase = new EnsureBusinessCreationAllowedUseCase(),
    private readonly categoryRepo: IBusinessCategoryRepo = new PostgresBusinessCategoryRepo(),
  ) {}

  public async execute(input: RegisterBusinessInput): Promise<RegisterBusinessOutput> {
    const parsed = registerBusinessSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const category = await this.categoryRepo.findById(parsed.data.categoryId);
    if (!category) {
      throw AppError.badRequest("Invalid category id.", "INVALID_CATEGORY");
    }

    const slug = await generateUniqueSlug(
      parsed.data.name,
      (s) => this.businessRepo.findBySlug(s),
    );

    const user = await this.userRepo.findById(parsed.data.ownerUserId);
    if (!user) {
      throw AppError.notFound("User not found.", "OWNER_NOT_FOUND");
    }

    if (user.role !== "user" && user.role !== "business_admin") {
      throw AppError.forbidden(
        "Only authenticated user accounts can register a business.",
        "NOT_ELIGIBLE_FOR_BUSINESS",
      );
    }

    const requiresPromotion = user.role === "user";

    try {
      // Organization creation is transparent (HU-2.5.1): an owner without one
      // yet gets one on their first business; existing accounts already have
      // one from the backfill migration.
      const { organizationId } = await this.createOrganizationForOwnerUseCase.execute({
        ownerUserId: parsed.data.ownerUserId,
        organizationName: parsed.data.name,
      });

      const currentBusinessCount = await this.businessRepo.countByOrganizationId(organizationId);
      await this.ensureBusinessCreationAllowedUseCase.execute({
        organizationId,
        currentBusinessCount,
      });

      // Maps is a later discovery concern, so geocoding enriches the record when available
      // but does not block the business profile from saving its textual address.
      const coordinates = await this.geocodingService.geocode(parsed.data.address);

      const business = await this.businessRepo.save({
        id: randomUUID(),
        name: parsed.data.name,
        slug,
        categoryId: parsed.data.categoryId,
        status: "pending",
        address: parsed.data.address,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        listingStatus: "draft",
        activeServiceWindows: 1,
        operationalStatus: "normal",
        ownerUserId: parsed.data.ownerUserId,
        organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (requiresPromotion) {
        await this.userRepo.save({
          ...user,
          role: "business_admin",
          approvalStatus: "pending",
        });
      }

      return {
        businessId: business.id,
        businessSlug: business.slug,
        status: "pending",
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.internal(
        "Failed to create business. Please try again.",
        "BUSINESS_REGISTRATION_FAILED",
      );
    }
  }
}
