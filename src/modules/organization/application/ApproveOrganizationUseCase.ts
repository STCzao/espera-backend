import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendOrganizationApprovedEmail } from "@shared/infrastructure/email";
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
  approvedByUserId: z.string().uuid("Invalid approver id."),
});

export type ApproveOrganizationInput = z.infer<typeof schema>;

/**
 * Approves an Organization (HU-8.3). This is the first of two independent
 * approval gates — approving the Organization does NOT approve any Business
 * under it; each Business is reviewed separately via ApproveBusinessUseCase.
 */
export class ApproveOrganizationUseCase implements UseCase<ApproveOrganizationInput, Organization> {
  public constructor(
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: ApproveOrganizationInput): Promise<Organization> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const organization = await this.organizationRepo.findById(parsed.data.organizationId);
    if (!organization) throw AppError.notFound("Organization not found.", "ORGANIZATION_NOT_FOUND");

    if (organization.status === "approved") {
      throw AppError.conflict("Organization is already approved.", "ORGANIZATION_ALREADY_APPROVED");
    }

    const now = new Date();
    const updated = await this.organizationRepo.save({
      ...organization,
      status: "approved",
      approvedByUserId: parsed.data.approvedByUserId,
      approvedAt: now,
      rejectedReason: undefined,
      rejectedAt: undefined,
      updatedAt: now,
    });

    const adminMembership = await this.membershipRepo.findAdminByOrganization(organization.id);
    const admin = adminMembership ? await this.userRepo.findById(adminMembership.userId) : null;

    if (admin) {
      try {
        await sendOrganizationApprovedEmail(admin.email, admin.firstName);
      } catch (error) {
        logger.error(
          { error, organizationId: organization.id },
          "Organization approved but confirmation email could not be sent",
        );
      }
    }

    return updated;
  }
}
