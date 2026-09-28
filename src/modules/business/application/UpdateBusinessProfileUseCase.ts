import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { BusinessCategoryConfig } from "../domain/BusinessCategoryConfig";
import { BusinessCategoryConfigRegistry } from "../domain/BusinessCategoryConfigRegistry";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import type { IGeocodingService } from "../domain/IGeocodingService";
import { GoogleMapsGeocodingService } from "../infrastructure/GoogleMapsGeocodingService";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const updateBusinessProfileSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  name: z.string().trim().min(2, "Business name is required.").max(120),
  categoryId: z.string().uuid("Invalid category id."),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().min(5, "Business address is required.").max(200),
});

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;

export interface UpdateBusinessProfileOutput {
  businessId: string;
  name: string;
  categoryId: string;
  phone?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  listingStatus: "draft" | "hidden" | "published";
  categoryConfig: BusinessCategoryConfig;
}

export class UpdateBusinessProfileUseCase
  implements UseCase<UpdateBusinessProfileInput, UpdateBusinessProfileOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly geocodingService: IGeocodingService = new GoogleMapsGeocodingService(),
    private readonly categoryConfigRegistry = new BusinessCategoryConfigRegistry(),
  ) {}

  public async execute(
    input: UpdateBusinessProfileInput,
  ): Promise<UpdateBusinessProfileOutput> {
    const parsed = updateBusinessProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    // Maps is a later discovery concern, so geocoding enriches the record when available
    // but does not block the business profile from saving its textual address.
    const coordinates = await this.geocodingService.geocode(parsed.data.address);

    const updatedBusiness = await this.businessRepo.save({
      ...business,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      phone: parsed.data.phone,
      address: parsed.data.address,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      updatedAt: new Date(),
    });

    return {
      businessId: updatedBusiness.id,
      name: updatedBusiness.name,
      categoryId: updatedBusiness.categoryId,
      phone: updatedBusiness.phone,
      address: updatedBusiness.address ?? parsed.data.address,
      latitude: updatedBusiness.latitude,
      longitude: updatedBusiness.longitude,
      listingStatus: updatedBusiness.listingStatus,
      categoryConfig: this.categoryConfigRegistry.getConfig(updatedBusiness.categoryId),
    };
  }
}
