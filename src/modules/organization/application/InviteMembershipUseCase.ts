import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import { sendMembershipInvitationEmail } from "@shared/infrastructure/email";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IMembershipInvitationRepo } from "../domain/IMembershipInvitationRepo";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import { PostgresMembershipInvitationRepo } from "../infrastructure/PostgresMembershipInvitationRepo";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  requestingUserId: z.string().uuid("Invalid requesting user id."),
  email: z.string({ required_error: "Email is required." }).trim().email("Invalid email.").max(254)
    .transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "employee"]),
});

export type InviteMembershipInput = z.infer<typeof schema>;

export interface InviteMembershipOutput {
  invitationId: string;
  organizationId: string;
  email: string;
  role: "admin" | "employee";
  status: "pending";
  expiresAt: string;
}

/**
 * Invites a user to join an Organization's Membership (co-admin or
 * org-level employee) — the self-service counterpart, one level up, of
 * InviteBusinessEmployeeUseCase. Only an active admin of the Organization
 * can invite.
 */
export class InviteMembershipUseCase
  implements UseCase<InviteMembershipInput, InviteMembershipOutput>
{
  public constructor(
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly invitationRepo: IMembershipInvitationRepo = new PostgresMembershipInvitationRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: InviteMembershipInput): Promise<InviteMembershipOutput> {
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

    const invitedUser = await this.userRepo.findByEmail(parsed.data.email);
    if (invitedUser) {
      const activeMembership = await this.membershipRepo.findByUserAndOrganization(
        invitedUser.id,
        parsed.data.organizationId,
      );
      if (activeMembership) {
        throw AppError.conflict(
          "This user already has access to the organization.",
          "MEMBERSHIP_ALREADY_ACTIVE",
        );
      }
    }

    // Keep the invitation inbox quiet: a still-valid pending invitation is the
    // source of truth until it expires or is accepted.
    const pendingInvitation = await this.invitationRepo.findPendingByOrganizationAndEmail(
      parsed.data.organizationId,
      parsed.data.email,
    );
    if (pendingInvitation && pendingInvitation.expiresAt > new Date()) {
      throw AppError.conflict(
        "A membership invitation is already pending for this email.",
        "MEMBERSHIP_INVITATION_PENDING",
      );
    }

    const invitation = await this.invitationRepo.save({
      id: randomUUID(),
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      token: randomBytes(32).toString("hex"),
      status: "pending",
      invitedByUserId: parsed.data.requestingUserId,
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await sendMembershipInvitationEmail(invitation.email, invitation.token);

    return {
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: "pending",
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
