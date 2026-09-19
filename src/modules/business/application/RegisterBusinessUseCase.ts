import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { IUnitOfWork } from "@shared/kernel/UnitOfWork";
import { PrismaUnitOfWork } from "@shared/infrastructure/PrismaUnitOfWork";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import {
  CreateOrganizationForOwnerUseCase,
  EnsureBusinessCreationAllowedUseCase,
} from "@modules/organization/public-api";
import { withUniqueSlug } from "@shared/infrastructure/withUniqueSlug";
import { isValidCuit } from "../../../shared/utils/cuit";
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
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().min(5, "Business address is required.").max(200),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  // Mandatory as of HU-2.5.5's revision — a CUIT is a legal requirement for
  // an Organization to operate, so registration is the gate that used to
  // let it through unset. UpdateOrganizationUseCase keeps the same format
  // rule for later edits.
  legalId: z
    .string({ required_error: "Legal id (CUIT) is required." })
    .trim()
    .min(1, "Legal id (CUIT) is required.")
    .refine(isValidCuit, "Invalid legal id (CUIT)."),
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
    private readonly unitOfWork: IUnitOfWork = new PrismaUnitOfWork(),
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
        legalId: parsed.data.legalId,
      });

      const currentBusinessCount = await this.businessRepo.countByOrganizationId(organizationId);
      await this.ensureBusinessCreationAllowedUseCase.execute({
        organizationId,
        currentBusinessCount,
      });

      // Maps is a later discovery concern, so geocoding enriches the record when available
      // but does not block the business profile from saving its textual address.
      const coordinates = await this.geocodingService.geocode(parsed.data.address);

      // The Business row and the owner's promotion to business_admin commit
      // together — a failure between them used to leave a Business with its
      // owner still role "user", and a retry created a second, duplicate
      // Business instead of noticing the first one. Wrapped by
      // withUniqueSlug (not just the save()) because a P2002 on `slug`
      // aborts the whole Postgres transaction — retrying that specific
      // insert inside the same transaction isn't possible, so each retry
      // opens a fresh one with a newly regenerated candidate slug.
      const business = await withUniqueSlug(
        parsed.data.name,
        (s) => this.businessRepo.findBySlug(s),
        (slug) => this.unitOfWork.run(async (tx) => {
          const business = await this.businessRepo.save({
            id: randomUUID(),
            name: parsed.data.name,
            slug,
            categoryId: parsed.data.categoryId,
            status: "pending",
            phone: parsed.data.phone,
            address: parsed.data.address,
            latitude: coordinates?.latitude,
            longitude: coordinates?.longitude,
            listingStatus: "draft",
            operationalStatus: "normal",
            ownerUserId: parsed.data.ownerUserId,
            organizationId,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, tx);

          if (requiresPromotion) {
            await this.userRepo.save({
              ...user,
              role: "business_admin",
              approvalStatus: "pending",
            }, tx);
          }

          return business;
        }),
      );

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
