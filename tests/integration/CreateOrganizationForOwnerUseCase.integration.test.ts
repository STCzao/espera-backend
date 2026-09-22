import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { CreateOrganizationForOwnerUseCase } from "../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import { PostgresMembershipRepo } from "../../src/modules/organization/infrastructure/PostgresMembershipRepo";
import { PostgresOrganizationRepo } from "../../src/modules/organization/infrastructure/PostgresOrganizationRepo";
import { PostgresSubscriptionRepo } from "../../src/modules/organization/infrastructure/PostgresSubscriptionRepo";
import { PrismaUnitOfWork } from "../../src/shared/infrastructure/PrismaUnitOfWork";
import { prisma } from "../../src/shared/infrastructure/prisma";

/**
 * Proves the fix against real Postgres, not just the in-memory fakes: the
 * Organization/Subscription/Membership writes either all commit or none do.
 * Before this fix, a failure on the last write (Membership) left an
 * orphaned Organization+Subscription behind — invisible to the unit suite
 * since the in-memory fakes have no real transaction to roll back.
 */
describe("CreateOrganizationForOwnerUseCase (real Postgres transaction)", () => {
  const useCase = new CreateOrganizationForOwnerUseCase(
    new PostgresOrganizationRepo(),
    new PostgresMembershipRepo(),
    new PostgresSubscriptionRepo(),
    new PrismaUnitOfWork(),
  );

  const ownerId = randomUUID();
  const createdOrganizationIds: string[] = [];

  afterEach(async () => {
    if (createdOrganizationIds.length === 0) return;
    await prisma.membership.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: createdOrganizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    // Safety net in case a rollback-path test failed and actually left a
    // row behind — keeps the test DB clean regardless of pass/fail.
    await prisma.organization.deleteMany({ where: { name: "Rollback Test Org" } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("commits Organization, Subscription and Membership together for a real owner", async () => {
    await prisma.user.create({
      data: { id: ownerId, email: `integration-org-owner-${ownerId}@example.com`, firstName: "Org", lastName: "Owner" },
    });

    const result = await useCase.execute({ ownerUserId: ownerId, organizationName: "Integration Test Org" });
    createdOrganizationIds.push(result.organizationId);

    const [organization, subscription, membership] = await Promise.all([
      prisma.organization.findUnique({ where: { id: result.organizationId } }),
      prisma.subscription.findUnique({ where: { organizationId: result.organizationId } }),
      prisma.membership.findUnique({ where: { userId_organizationId: { userId: ownerId, organizationId: result.organizationId } } }),
    ]);

    expect(organization).not.toBeNull();
    expect(subscription).toMatchObject({ plan: "BASIC" });
    expect(membership).toMatchObject({ role: "ADMIN" });
  });

  it("rolls back the Organization and Subscription when the Membership insert fails (no matching User)", async () => {
    const nonExistentUserId = randomUUID();

    await expect(
      useCase.execute({ ownerUserId: nonExistentUserId, organizationName: "Rollback Test Org" }),
    ).rejects.toThrow();

    const orphanedOrganizations = await prisma.organization.findMany({
      where: { name: "Rollback Test Org" },
    });
    expect(orphanedOrganizations).toHaveLength(0);
  });
});
