import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { MembershipRole } from "../domain/Membership";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";

export interface ResolveEffectiveRoleInput {
  userId: string;
  organizationId: string;
}

export interface ResolveEffectiveRoleOutput {
  role: MembershipRole | null;
}

/**
 * Derives a user's effective role for a given Organization strictly from
 * Membership (HU-2.5.3), never from the legacy global `role` field on User.
 *
 * Not wired into `middleware/authorize.ts` yet: migrating the RBAC
 * middleware to consume this is explicitly out of scope for Épica 2.5.
 */
export class ResolveEffectiveRoleUseCase
  implements UseCase<ResolveEffectiveRoleInput, ResolveEffectiveRoleOutput>
{
  public constructor(
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
  ) {}

  public async execute(
    input: ResolveEffectiveRoleInput,
  ): Promise<ResolveEffectiveRoleOutput> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      input.userId,
      input.organizationId,
    );

    return { role: membership?.role ?? null };
  }
}
