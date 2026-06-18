import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import { sendBusinessEmployeeInvitationEmail } from "@shared/infrastructure/email";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeInvitationRepo } from "../domain/IBusinessEmployeeInvitationRepo";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeInvitationRepo } from "../infrastructure/PostgresBusinessEmployeeInvitationRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const inviteBusinessEmployeeSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  email: z
    .string({ required_error: "Employee email is required." })
    .trim()
    .email("Invalid employee email.")
    .max(254)
    .transform((value) => value.toLowerCase()),
});

export type InviteBusinessEmployeeInput = z.infer<
  typeof inviteBusinessEmployeeSchema
>;

export interface InviteBusinessEmployeeOutput {
  invitationId: string;
  businessId: string;
  email: string;
  status: "pending";
  expiresAt: string;
}

export class InviteBusinessEmployeeUseCase
  implements UseCase<InviteBusinessEmployeeInput, InviteBusinessEmployeeOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
    private readonly invitationRepo: IBusinessEmployeeInvitationRepo = new PostgresBusinessEmployeeInvitationRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(
    input: InviteBusinessEmployeeInput,
  ): Promise<InviteBusinessEmployeeOutput> {
    const parsed = inviteBusinessEmployeeSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to manage employees for this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    // Employees are scoped to a business; the owner already has full access and
    // should not also receive a delegated membership for the same business.
    const invitedUser = await this.userRepo.findByEmail(parsed.data.email);
    if (invitedUser?.id === parsed.data.ownerUserId) {
      throw AppError.badRequest(
        "The business owner cannot be invited as an employee.",
        "OWNER_CANNOT_BE_EMPLOYEE",
      );
    }

    if (invitedUser) {
      const activeEmployee = await this.employeeRepo.findActiveByBusinessAndUser(
        business.id,
        invitedUser.id,
      );
      if (activeEmployee) {
        throw AppError.conflict(
          "Employee already has access to this business.",
          "EMPLOYEE_ALREADY_ACTIVE",
        );
      }
    }

    // Keep the invitation inbox quiet: a still-valid pending invitation is the
    // source of truth until it expires or is accepted.
    const pendingInvitation =
      await this.invitationRepo.findPendingByBusinessAndEmail(
        business.id,
        parsed.data.email,
      );
    if (pendingInvitation && pendingInvitation.expiresAt > new Date()) {
      throw AppError.conflict(
        "Employee invitation already pending.",
        "EMPLOYEE_INVITATION_PENDING",
      );
    }

    // The token is random and opaque because acceptance may happen without an
    // authenticated session.
    const invitation = await this.invitationRepo.save({
      id: randomUUID(),
      businessId: business.id,
      email: parsed.data.email,
      token: randomBytes(32).toString("hex"),
      status: "pending",
      invitedByUserId: parsed.data.ownerUserId,
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await sendBusinessEmployeeInvitationEmail(invitation.email, invitation.token);

    return {
      invitationId: invitation.id,
      businessId: invitation.businessId,
      email: invitation.email,
      status: "pending",
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
