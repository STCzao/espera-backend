import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { RegisterBusinessUseCase } from "../../src/modules/business/application/RegisterBusinessUseCase";
import { PostgresBusinessCategoryRepo } from "../../src/modules/business/infrastructure/PostgresBusinessCategoryRepo";
import { PostgresBusinessRepo } from "../../src/modules/business/infrastructure/PostgresBusinessRepo";
import { PostgresUserRepo } from "../../src/modules/auth/infrastructure/PostgresUserRepo";
import { CreateOrganizationForOwnerUseCase } from "../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import { EnsureBusinessCreationAllowedUseCase } from "../../src/modules/organization/application/EnsureBusinessCreationAllowedUseCase";
import { PrismaUnitOfWork } from "../../src/shared/infrastructure/PrismaUnitOfWork";
import { prisma } from "../../src/shared/infrastructure/prisma";
import type { User } from "../../src/modules/auth/domain/User";
import type { TransactionHandle } from "../../src/shared/kernel/Repository";

const noopGeocodingService = { geocode: async () => null };

/**
 * Proves against real Postgres that the Business row and the owner's
 * promotion to business_admin commit or roll back together — before this
 * fix, a failure on the role-promotion write left an orphaned Business with
 * its owner still role "user", and a retry created a duplicate Business.
 */
describe("RegisterBusinessUseCase (real Postgres transaction)", () => {
  const ownerId = randomUUID();
  const categoryId = randomUUID();
  const businessRepo = new PostgresBusinessRepo();
  const userRepo = new PostgresUserRepo();
  const createdBusinessNames: string[] = [];
  const extraOwnerIds: string[] = [];

  const buildUseCase = (deps: { userRepo?: PostgresUserRepo } = {}) =>
    new RegisterBusinessUseCase(
      businessRepo,
      deps.userRepo ?? userRepo,
      noopGeocodingService,
      new CreateOrganizationForOwnerUseCase(),
      new EnsureBusinessCreationAllowedUseCase(),
      new PostgresBusinessCategoryRepo(),
      new PrismaUnitOfWork(),
    );

  beforeAll(async () => {
    await prisma.businessCategory.create({
      data: { id: categoryId, name: "Integration Register Category", slug: `integration-register-category-${categoryId}` },
    });
  });

  afterEach(async () => {
    if (createdBusinessNames.length === 0) return;
    await prisma.business.deleteMany({ where: { name: { in: createdBusinessNames } } });
    createdBusinessNames.length = 0;
  });

  afterAll(async () => {
    const allOwnerIds = [ownerId, ...extraOwnerIds];
    await prisma.membership.deleteMany({ where: { userId: { in: allOwnerIds } } });
    await prisma.subscription.deleteMany({ where: { organization: { memberships: { some: { userId: { in: allOwnerIds } } } } } });
    await prisma.organization.deleteMany({ where: { memberships: { some: { userId: { in: allOwnerIds } } } } });
    await prisma.user.deleteMany({ where: { id: { in: allOwnerIds } } });
    await prisma.businessCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it("commits the Business and the owner's role promotion together", async () => {
    await prisma.user.create({
      data: { id: ownerId, email: `integration-register-owner-${ownerId}@example.com`, firstName: "Owner", lastName: "Test", role: "USER" },
    });
    const businessName = `Integration Register Business ${randomUUID()}`;
    createdBusinessNames.push(businessName);

    const result = await buildUseCase().execute({
      name: businessName,
      categoryId,
      address: "Av. Test 123",
      ownerUserId: ownerId,
      legalId: "20-12345678-6",
    });

    expect(result.status).toBe("pending");

    const [business, owner] = await Promise.all([
      businessRepo.findById(result.businessId),
      userRepo.findById(ownerId),
    ]);

    expect(business).not.toBeNull();
    expect(owner?.role).toBe("business_admin");
    expect(owner?.approvalStatus).toBe("pending");
  });

  it("rolls back the Business insert when the role-promotion write fails mid-transaction", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { role: "USER", approvalStatus: "APPROVED" } });
    const businessName = `Integration Register Rollback ${randomUUID()}`;
    createdBusinessNames.push(businessName);

    const poisonedUserRepo = new PostgresUserRepo();
    poisonedUserRepo.save = async (_user: User, _tx?: TransactionHandle) => {
      throw new Error("simulated mid-transaction failure");
    };

    await expect(
      buildUseCase({ userRepo: poisonedUserRepo }).execute({
        name: businessName,
        categoryId,
        address: "Av. Test 123",
        ownerUserId: ownerId,
        legalId: "20-12345678-6",
      }),
    ).rejects.toThrow();

    const [orphanedBusinesses, owner] = await Promise.all([
      prisma.business.findMany({ where: { name: businessName } }),
      userRepo.findById(ownerId),
    ]);

    expect(orphanedBusinesses).toHaveLength(0);
    expect(owner?.role).toBe("user");
  });

  it("gives two truly concurrent registrations with the same name different slugs instead of a 500", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    extraOwnerIds.push(ownerA, ownerB);
    await prisma.user.createMany({
      data: [
        { id: ownerA, email: `integration-slug-owner-a-${ownerA}@example.com`, firstName: "A", lastName: "Test", role: "USER" },
        { id: ownerB, email: `integration-slug-owner-b-${ownerB}@example.com`, firstName: "B", lastName: "Test", role: "USER" },
      ],
    });

    const sharedName = `Integration Slug Race ${randomUUID().slice(0, 8)}`;
    createdBusinessNames.push(sharedName);

    const [resultA, resultB] = await Promise.all([
      buildUseCase().execute({ name: sharedName, categoryId, address: "Av. Test 123", ownerUserId: ownerA, legalId: "20-12345678-6" }),
      buildUseCase().execute({ name: sharedName, categoryId, address: "Av. Test 123", ownerUserId: ownerB, legalId: "20-12345678-6" }),
    ]);

    expect(resultA.businessSlug).not.toBe(resultB.businessSlug);
  });
});
