import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeInvitationRepo } from "../domain/IBusinessEmployeeInvitationRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeInvitationRepo } from "../infrastructure/PostgresBusinessEmployeeInvitationRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ListPendingBusinessEmployeeInvitationsInput = z.infer<typeof schema>;

export interface ListPendingBusinessEmployeeInvitationsOutput {
  businessId: string;
  invitations: Array<{
    invitationId: string;
    email: string;
    invitedAt: string;
    expiresAt: string;
  }>;
}

/**
 * Closes a visibility gap in the panel: ListBusinessEmployeesUseCase only
 * shows already-accepted employees, so an invitation that was sent but never
 * accepted had no way to surface — the owner had to just wonder whether it
 * got lost. Filters expiresAt > now defensively instead of trusting the
 * stored "pending" status alone, same lazy-reconciliation spirit as
 * ResolveEffectiveSubscriptionStatusUseCase (nothing flips status to
 * "expired" on a timer here either).
 */
export class ListPendingBusinessEmployeeInvitationsUseCase
  implements UseCase<ListPendingBusinessEmployeeInvitationsInput, ListPendingBusinessEmployeeInvitationsOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly invitationRepo: IBusinessEmployeeInvitationRepo = new PostgresBusinessEmployeeInvitationRepo(),
  ) {}

  public async execute(
    input: ListPendingBusinessEmployeeInvitationsInput,
  ): Promise<ListPendingBusinessEmployeeInvitationsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to view employees for this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const invitations = await this.invitationRepo.findPendingByBusinessId(business.id);
    const now = new Date();

    return {
      businessId: business.id,
      invitations: invitations
        .filter((invitation) => invitation.expiresAt > now)
        .map((invitation) => ({
          invitationId: invitation.id,
          email: invitation.email,
          invitedAt: invitation.createdAt.toISOString(),
          expiresAt: invitation.expiresAt.toISOString(),
        })),
    };
  }
}
