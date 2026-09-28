import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

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
    const existing = await this.findAdminOrganizationId(input.ownerUserId);
    if (existing) return { organizationId: existing };

    const now = new Date();

    // All three writes commit together or not at all — a partial failure
    // used to leave an orphaned Organization+Subscription with no Membership
    // pointing at them, and the owner's next attempt would create a second,
    // duplicate set instead of noticing the first one.
    try {
      return await this.createOrganization(input, now);
    } catch (error) {
      // A concurrent first registration for the same owner won the race: the
      // partial unique index on ADMIN memberships (see migration
      // 20260924000000_unique_admin_membership_per_user) rolled this whole
      // transaction back, so reuse the organization the winner created.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.findAdminOrganizationId(input.ownerUserId);
        if (winner) return { organizationId: winner };
      }
      throw error;
    }
  }

  private async findAdminOrganizationId(ownerUserId: string): Promise<string | null> {
    const memberships = await this.membershipRepo.findByUser(ownerUserId);
    return memberships.find((membership) => membership.role === "admin")?.organizationId ?? null;
  }

  private async createOrganization(
    input: CreateOrganizationForOwnerInput,
    now: Date,
  ): Promise<CreateOrganizationForOwnerOutput> {
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
