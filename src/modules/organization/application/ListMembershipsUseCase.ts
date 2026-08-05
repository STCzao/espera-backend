import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { Membership } from "../domain/Membership";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

const schema = z.object({
  organizationId:   z.string().uuid("Invalid organization id."),
  requestingUserId: z.string().uuid("Invalid requesting user id."),
});

export type ListMembershipsInput = z.infer<typeof schema>;

export interface ListMembershipsOutput {
  organizationId: string;
  memberships: Membership[];
}

/**
 * Lists every active Membership for an Organization — was only reachable
 * internally before this (no findByOrganizationId, no HTTP surface at
 * all). Any active member (admin or employee) can see who else has access.
 */
export class ListMembershipsUseCase
  implements UseCase<ListMembershipsInput, ListMembershipsOutput>
{
  public constructor(
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
  ) {}

  public async execute(input: ListMembershipsInput): Promise<ListMembershipsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const requesterMembership = await this.membershipRepo.findByUserAndOrganization(
      parsed.data.requestingUserId,
      parsed.data.organizationId,
    );
    if (!requesterMembership) {
      throw AppError.forbidden(
        "You do not have permission to view members for this organization.",
        "ORGANIZATION_OWNERSHIP_REQUIRED",
      );
    }

    const memberships = await this.membershipRepo.findByOrganizationId(parsed.data.organizationId);

    return { organizationId: parsed.data.organizationId, memberships };
  }
}
