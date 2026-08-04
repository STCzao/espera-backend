import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendOrganizationRejectedEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { Organization } from "../domain/Organization";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";
import { PostgresOrganizationRepo } from "../infrastructure/PostgresOrganizationRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  rejectedByUserId: z.string().uuid("Invalid reviewer id."),
  reason:           z.string().trim().min(1, "Rejection reason is required.").max(500),
});

export type RejectOrganizationInput = z.infer<typeof schema>;

/**
 * Rejects a pending Organization (HU-8.3). Only allowed while the
 * Organization is still pending — an already-approved Organization cannot
 * be rejected here (that would require a separate suspension flow, out of
 * scope for this use case).
 */
export class RejectOrganizationUseCase implements UseCase<RejectOrganizationInput, Organization> {
  public constructor(
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: RejectOrganizationInput): Promise<Organization> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const organization = await this.organizationRepo.findById(parsed.data.organizationId);
    if (!organization) throw AppError.notFound("Organization not found.", "ORGANIZATION_NOT_FOUND");

    if (organization.status !== "pending") {
      throw AppError.conflict("Only a pending organization can be rejected.", "ORGANIZATION_NOT_PENDING");
    }

    const now = new Date();
    const updated = await this.organizationRepo.save({
      ...organization,
      status: "rejected",
      rejectedReason: parsed.data.reason,
      rejectedAt: now,
      approvedByUserId: undefined,
      approvedAt: undefined,
      updatedAt: now,
    });

    const adminMembership = await this.membershipRepo.findAdminByOrganization(organization.id);
    const admin = adminMembership ? await this.userRepo.findById(adminMembership.userId) : null;

    if (admin) {
      try {
        await sendOrganizationRejectedEmail(admin.email, admin.firstName, parsed.data.reason);
      } catch (error) {
        logger.error(
          { error, organizationId: organization.id },
          "Organization rejected but notification email could not be sent",
        );
      }
    }

    return updated;
  }
}
