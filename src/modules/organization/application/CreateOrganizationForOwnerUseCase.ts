import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IUnitOfWork } from "../../../shared/kernel/UnitOfWork";
import { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";
import { PostgresOrganizationRepo } from "../infrastructure/PostgresOrganizationRepo";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

export interface CreateOrganizationForOwnerInput {
  ownerUserId: string;
  organizationName: string;
  /**
   * Optional at this point on purpose (HU-2.5.5) — only applied when a new
   * Organization is actually created here. An owner registering a second
   * Business under an Organization they already have keeps using
   * PATCH /api/organizations/:organizationId to set/change it later.
   */
  legalId?: string;
}

export interface CreateOrganizationForOwnerOutput {
  organizationId: string;
}

/**
 * Resolves the Organization an owner should create their next Business
 * under, creating it transparently with a BASIC Subscription and an ADMIN
 * Membership on first use (HU-2.5.1).
 *
 * Existing accounts already have an Organization from the backfill
 * migration, so this only creates a new one the first time an owner
 * registers a Business after Épica 2.5 ships.
 */
export class CreateOrganizationForOwnerUseCase
  implements UseCase<CreateOrganizationForOwnerInput, CreateOrganizationForOwnerOutput>
{
  public constructor(
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
    private readonly membershipRepo: IMembershipRepo = new PostgresMembershipRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly unitOfWork: IUnitOfWork = new PrismaUnitOfWork(),
  ) {}

  public async execute(
    input: CreateOrganizationForOwnerInput,
  ): Promise<CreateOrganizationForOwnerOutput> {
    const existingMemberships = await this.membershipRepo.findByUser(input.ownerUserId);
    const existingAdminMembership = existingMemberships.find(
      (membership) => membership.role === "admin",
    );

    if (existingAdminMembership) {
      return { organizationId: existingAdminMembership.organizationId };
    }

    const now = new Date();

    // All three writes commit together or not at all — a partial failure
    // used to leave an orphaned Organization+Subscription with no Membership
    // pointing at them, and the owner's next attempt would create a second,
    // duplicate set instead of noticing the first one.
    const organization = await this.unitOfWork.run(async (tx) => {
      const organization = await this.organizationRepo.save({
        id: randomUUID(),
        name: input.organizationName,
        legalId: input.legalId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      }, tx);

      await this.subscriptionRepo.save({
        id: randomUUID(),
        organizationId: organization.id,
        plan: "basic",
        status: "pending",
        trialEndsAt: null,
        activatedByUserId: null,
        activatedAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      }, tx);

      await this.membershipRepo.save({
        id: randomUUID(),
        userId: input.ownerUserId,
        organizationId: organization.id,
        role: "admin",
        createdAt: now,
        updatedAt: now,
      }, tx);

      return organization;
    });

    return { organizationId: organization.id };
  }
}
