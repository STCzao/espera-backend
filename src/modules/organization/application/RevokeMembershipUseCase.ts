import { z } from "zod";

import type { IRefreshSessionRepo } from "@modules/auth/public-api";
import { PostgresRefreshSessionRepo } from "@modules/auth/public-api";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  requestingUserId: z.string().uuid("Invalid requesting user id."),
  userId:           z.string().uuid("Invalid member user id."),
});

export type RevokeMembershipInput = z.infer<typeof schema>;

export interface RevokeMembershipOutput {
  organizationId: string;
  userId: string;
  revoked: true;
}

/**
 * Revokes a Membership — self-service counterpart of
 * RevokeBusinessEmployeeUseCase, one level up. Refuses to leave the
 * Organization with zero active admins — including self-revocation: an
 * admin can step down if another admin exists to take over, but not if
 * they're the last one (nobody would be left to manage the account or
 * undo the mistake).
 */
export class RevokeMembershipUseCase
  implements UseCase<RevokeMembershipInput, RevokeMembershipOutput>
{
  public constructor(
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
  ) {}

  public async execute(input: RevokeMembershipInput): Promise<RevokeMembershipOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const requesterMembership = await this.membershipRepo.findByUserAndOrganization(
      parsed.data.requestingUserId,
      parsed.data.organizationId,
    );
    if (!requesterMembership || requesterMembership.role !== "admin") {
      throw AppError.forbidden(
        "You do not have permission to revoke members for this organization.",
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

    if (target.role === "admin") {
      const activeMembers = await this.membershipRepo.findByOrganizationId(parsed.data.organizationId);
      const activeAdminCount = activeMembers.filter((m) => m.role === "admin").length;
      if (activeAdminCount <= 1) {
        throw AppError.conflict(
          "Cannot revoke the organization's last active admin.",
          "CANNOT_REVOKE_LAST_ADMIN",
        );
      }
    }

    const revoked = await this.membershipRepo.revokeByOrganizationAndUser(
      parsed.data.organizationId,
      parsed.data.userId,
      new Date(),
    );
    if (!revoked) {
      throw AppError.notFound("Membership not found.", "MEMBERSHIP_NOT_FOUND");
    }

    // Revocation removes future refresh capability immediately. Existing
    // short-lived access tokens may remain valid until their natural expiry.
    await this.refreshSessionRepo.revokeAllByUserId(parsed.data.userId);

    return { organizationId: parsed.data.organizationId, userId: parsed.data.userId, revoked: true };
  }
}
