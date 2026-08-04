import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { Organization } from "../domain/Organization";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";
import { PostgresOrganizationRepo } from "../infrastructure/PostgresOrganizationRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  requestingUserId: z.string().uuid("Invalid requesting user id."),
  name:             z.string().trim().min(2, "Organization name is required.").max(120).optional(),
  legalId:          z.string().trim().min(1, "Legal id cannot be empty.").max(50).optional(),
});

export type UpdateOrganizationInput = z.infer<typeof schema>;

/**
 * Lets an Organization's admin (via Membership) edit its name and/or
 * legalId (HU-2.5.5 — legalId is optional at creation and editable after).
 * Does not touch approval status.
 */
export class UpdateOrganizationUseCase implements UseCase<UpdateOrganizationInput, Organization> {
  public constructor(
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
  ) {}

  public async execute(input: UpdateOrganizationInput): Promise<Organization> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const organization = await this.organizationRepo.findById(parsed.data.organizationId);
    if (!organization) throw AppError.notFound("Organization not found.", "ORGANIZATION_NOT_FOUND");

    const membership = await this.membershipRepo.findByUserAndOrganization(
      parsed.data.requestingUserId,
      parsed.data.organizationId,
    );
    if (!membership || membership.role !== "admin") {
      throw AppError.forbidden(
        "You do not have permission to edit this organization.",
        "ORGANIZATION_OWNERSHIP_REQUIRED",
      );
    }

    return this.organizationRepo.save({
      ...organization,
      name:      parsed.data.name ?? organization.name,
      legalId:   parsed.data.legalId ?? organization.legalId,
      updatedAt: new Date(),
    });
  }
}
