import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";
import type { IMembershipRepo } from "../domain/IMembershipRepo";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import { PostgresMembershipRepo } from "../infrastructure/PostgresMembershipRepo";
import { PostgresOrganizationRepo } from "../infrastructure/PostgresOrganizationRepo";
import { PostgresSubscriptionRepo } from "../infrastructure/PostgresSubscriptionRepo";

export interface CreateOrganizationForOwnerInput {
  ownerUserId: string;
  organizationName: string;
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
    const organization = await this.organizationRepo.save({
      id: randomUUID(),
      name: input.organizationName,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

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
    });

    await this.membershipRepo.save({
      id: randomUUID(),
      userId: input.ownerUserId,
      organizationId: organization.id,
      role: "admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return { organizationId: organization.id };
  }
}
