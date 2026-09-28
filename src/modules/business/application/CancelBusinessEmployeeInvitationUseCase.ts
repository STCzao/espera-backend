import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeInvitationRepo } from "../domain/IBusinessEmployeeInvitationRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeInvitationRepo } from "../infrastructure/PostgresBusinessEmployeeInvitationRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId:   z.string().uuid("Invalid business id."),
  ownerUserId:  z.string().uuid("Invalid owner user id."),
  invitationId: z.string().uuid("Invalid invitation id."),
});

export type CancelBusinessEmployeeInvitationInput = z.infer<typeof schema>;

export interface CancelBusinessEmployeeInvitationOutput {
  invitationId: string;
  businessId: string;
  status: "revoked";
}

/**
 * Closes the gap InviteBusinessEmployeeUseCase left open: once an invitation
 * is sent there was no way to undo it — a candidate who was invited by
 * mistake, or who the business changed its mind about, kept a valid
 * accept-link for the full 7-day expiry with nothing the owner could do
 * about it.
 */
export class CancelBusinessEmployeeInvitationUseCase
  implements UseCase<CancelBusinessEmployeeInvitationInput, CancelBusinessEmployeeInvitationOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly invitationRepo: IBusinessEmployeeInvitationRepo = new PostgresBusinessEmployeeInvitationRepo(),
  ) {}

  public async execute(
    input: CancelBusinessEmployeeInvitationInput,
  ): Promise<CancelBusinessEmployeeInvitationOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to manage employees for this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const invitation = await this.invitationRepo.findById(parsed.data.invitationId);
    if (!invitation || invitation.businessId !== business.id) {
      throw AppError.notFound("Employee invitation not found.", "EMPLOYEE_INVITATION_NOT_FOUND");
    }

    if (invitation.status !== "pending") {
      throw AppError.conflict(
        "Only a pending invitation can be cancelled.",
        "EMPLOYEE_INVITATION_NOT_PENDING",
      );
    }

    await this.invitationRepo.save({
      ...invitation,
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      invitationId: invitation.id,
      businessId: business.id,
      status: "revoked",
    };
  }
}
