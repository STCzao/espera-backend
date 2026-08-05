import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IOrganizationRepo } from "@modules/organization/public-api";
import { PostgresOrganizationRepo } from "@modules/organization/public-api";
import type { CoherenceAlert } from "./businessCoherence";
import { computeBusinessCoherenceAlerts } from "./businessCoherence";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId: z.string().uuid("Invalid business id."),
});

export type GetBusinessReviewDetailInput = z.infer<typeof schema>;

export interface GetBusinessReviewDetailOutput {
  business: Business;
  organization: {
    id: string;
    name: string;
    legalId?: string;
    categoryId?: string;
  };
  alerts: CoherenceAlert[];
}

/**
 * Detail view for reviewing a single Business (HU-8.7): surfaces its
 * Organization's category and legalId side by side so a reviewer can
 * compare them, plus the coherence alerts computed from that comparison.
 */
export class GetBusinessReviewDetailUseCase
  implements UseCase<GetBusinessReviewDetailInput, GetBusinessReviewDetailOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
  ) {}

  public async execute(input: GetBusinessReviewDetailInput): Promise<GetBusinessReviewDetailOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    const organization = await this.organizationRepo.findById(business.organizationId);
    if (!organization) throw AppError.notFound("Organization not found.", "ORGANIZATION_NOT_FOUND");

    return {
      business,
      organization: {
        id: organization.id,
        name: organization.name,
        legalId: organization.legalId,
        categoryId: organization.categoryId,
      },
      alerts: computeBusinessCoherenceAlerts(business, organization),
    };
  }
}
