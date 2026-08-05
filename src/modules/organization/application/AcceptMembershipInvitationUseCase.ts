import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { z } from "zod";

import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IMembershipInvitationRepo } from "../domain/IMembershipInvitationRepo";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { MembershipRole } from "../domain/Membership";
import { PostgresMembershipInvitationRepo } from "../infrastructure/PostgresMembershipInvitationRepo";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const schema = z.object({
  token: z.string().min(32, "Invalid membership invitation token."),
  firstName: z.string().trim().min(2).max(50).optional(),
  lastName:  z.string().trim().min(2).max(50).optional(),
  password: z.string().min(8).max(72).regex(
    passwordRegex,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number.",
  ).optional(),
});

export type AcceptMembershipInvitationInput = z.infer<typeof schema>;

export interface AcceptMembershipInvitationOutput {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: "active";
}

/**
 * Accepts a Membership invitation (HU-2.5.2's missing self-service half).
 * If the invited email has no account yet, creates one — firstName/
 * lastName/password become required in that case only. If the account
 * already exists, its profile is left untouched: this only grants
 * Membership access, it never overwrites an existing identity or password.
 *
 * Deliberately does not touch User.role: the RBAC migration from the
 * legacy global role to Membership's effective role is still deferred
 * (HU-2.5.3), so this stays a pure Membership grant.
 */
export class AcceptMembershipInvitationUseCase
  implements UseCase<AcceptMembershipInvitationInput, AcceptMembershipInvitationOutput>
{
  public constructor(
    private readonly invitationRepo: IMembershipInvitationRepo = new PostgresMembershipInvitationRepo(),
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: AcceptMembershipInvitationInput): Promise<AcceptMembershipInvitationOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const invitation = await this.invitationRepo.findByToken(parsed.data.token);
    if (!invitation || invitation.status !== "pending") {
      throw AppError.notFound("Membership invitation not found.", "MEMBERSHIP_INVITATION_NOT_FOUND");
    }

    if (invitation.expiresAt <= new Date()) {
      await this.invitationRepo.save({ ...invitation, status: "expired", updatedAt: new Date() });
      throw AppError.badRequest("Membership invitation has expired.", "MEMBERSHIP_INVITATION_EXPIRED");
    }

    const existingUser = await this.userRepo.findByEmail(invitation.email);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      if (!parsed.data.firstName || !parsed.data.lastName || !parsed.data.password) {
        throw AppError.badRequest(
          "First name, last name and password are required to create your account.",
          "ACCOUNT_DETAILS_REQUIRED",
        );
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await this.userRepo.save({
        id: randomUUID(),
        email: invitation.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        passwordHash,
        role: "user",
        approvalStatus: "approved",
        authProvider: "local",
        isEmailVerified: true,
        isBlocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userId = user.id;
    }

    // Re-accepting after a previous revocation reactivates the membership
    // because the repository upserts on organization + user.
    const membership = await this.membershipRepo.save({
      id: randomUUID(),
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
      status: "active",
      invitedByUserId: invitation.invitedByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.invitationRepo.save({
      ...invitation,
      status: "accepted",
      acceptedUserId: userId,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      organizationId: membership.organizationId,
      userId,
      role: membership.role,
      status: "active",
    };
  }
}
