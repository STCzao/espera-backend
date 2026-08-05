import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { Membership } from "../domain/Membership";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  requestingUserId: z.string().uuid("Invalid requesting user id."),
  userId:           z.string().uuid("Invalid member user id."),
  role:             z.enum(["admin", "employee"]),
});

export type UpdateMembershipRoleInput = z.infer<typeof schema>;

/**
 * Changes a member's role within an Organization. Refuses to demote the
 * last active admin to employee — same guard as RevokeMembershipUseCase,
 * for the same reason (an account can never be left with zero admins).
 */
export class UpdateMembershipRoleUseCase
  implements UseCase<UpdateMembershipRoleInput, Membership>
{
  public constructor(
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
  ) {}

  public async execute(input: UpdateMembershipRoleInput): Promise<Membership> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const requesterMembership = await this.membershipRepo.findByUserAndOrganization(
      parsed.data.requestingUserId,
      parsed.data.organizationId,
    );
    if (!requesterMembership || requesterMembership.role !== "admin") {
      throw AppError.forbidden(
        "You do not have permission to manage members for this organization.",
        "ORGANIZATION_OWNERSHIP_REQUIRED",
      );
    }

    const target = await this.membershipRepo.findByUserAndOrganization(
      parsed.data.userId,
      parsed.data.organizationId,
    );
    if (!target) {
      throw AppError.notFound("Membership not found.", "MEMBERSHIP_NOT_FOUND");
    }

    if (target.role === "admin" && parsed.data.role === "employee") {
      const activeMembers = await this.membershipRepo.findByOrganizationId(parsed.data.organizationId);
      const activeAdminCount = activeMembers.filter((m) => m.role === "admin").length;
      if (activeAdminCount <= 1) {
        throw AppError.conflict(
          "Cannot demote the organization's last active admin.",
          "CANNOT_DEMOTE_LAST_ADMIN",
        );
      }
    }

    return this.membershipRepo.save({
      ...target,
      role: parsed.data.role,
      updatedAt: new Date(),
    });
  }
}
