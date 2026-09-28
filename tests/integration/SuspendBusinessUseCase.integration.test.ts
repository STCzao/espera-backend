import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SuspendBusinessUseCase } from "../../src/modules/business/application/SuspendBusinessUseCase";
import { PostgresBusinessEmployeeRepo } from "../../src/modules/business/infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../../src/modules/business/infrastructure/PostgresBusinessRepo";
import { PostgresRefreshSessionRepo } from "../../src/modules/auth/infrastructure/PostgresRefreshSessionRepo";
import { PostgresQueueRepo } from "../../src/modules/queue/infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../../src/modules/queue/infrastructure/PostgresTurnRepo";
import type { Turn } from "../../src/modules/queue/domain/Turn";
import type { TransactionHandle } from "../../src/shared/kernel/Repository";
import { PrismaUnitOfWork } from "../../src/shared/infrastructure/PrismaUnitOfWork";
import { prisma } from "../../src/shared/infrastructure/prisma";

/**
 * Proves two things against real Postgres that the unit suite (in-memory
 * fakes) can't: (1) the business status flip, every session revocation and
 * every turn cancellation actually commit or roll back together, and (2)
 * Prisma's interactive transaction handles the Promise.all over concurrent
 * revokeAllByUserId calls sharing one `tx` without erroring — a real gotcha
 * with interactive transactions that only shows up against a real
 * connection.
 */
describe("SuspendBusinessUseCase (real Postgres transaction)", () => {
  const ownerId = randomUUID();
  const employeeId = randomUUID();
  const categoryId = randomUUID();
  const organizationId = randomUUID();

  const businessRepo = new PostgresBusinessRepo();
  const employeeRepo = new PostgresBusinessEmployeeRepo();
  const refreshSessionRepo = new PostgresRefreshSessionRepo();
  const queueRepo = new PostgresQueueRepo();
  const turnRepo = new PostgresTurnRepo();

  const buildUseCase = (deps: { turnRepo?: typeof turnRepo } = {}) =>
    new SuspendBusinessUseCase(
      businessRepo,
      employeeRepo,
      refreshSessionRepo,
      queueRepo,
      deps.turnRepo ?? turnRepo,
      null,
      new PrismaUnitOfWork(),
    );

  const seedScenario = async () => {
    const businessId = randomUUID();
    const queueId = randomUUID();

    await prisma.business.create({
      data: {
        id: businessId,
        name: "Integration Suspend Business",
        slug: `integration-suspend-business-${businessId}`,
        categoryId,
        ownerUserId: ownerId,
        organizationId,
        status: "APPROVED",
      },
    });
    await prisma.businessEmployee.create({
      data: { id: randomUUID(), businessId, userId: employeeId, status: "ACTIVE", invitedByUserId: ownerId },
    });
    await prisma.queue.create({
      data: { id: queueId, businessId, name: "Integration Queue", prefix: "T" },
    });
    for (const userId of [ownerId, employeeId]) {
      await prisma.refreshSession.create({
        data: {
          id: randomUUID(),
          userId,
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    const turnA = await turnRepo.createWithNextNumber({
      queueId, businessId, guestName: "Turn A", priority: "registered", source: "app",
      turnDate: new Date(), prefix: "T", queueJoinedAt: new Date(),
    });
    const turnB = await turnRepo.createWithNextNumber({
      queueId, businessId, guestName: "Turn B", priority: "registered", source: "app",
      turnDate: new Date(), prefix: "T", queueJoinedAt: new Date(),
    });

    return { businessId, queueId, turnA, turnB };
  };

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ownerId, email: `integration-suspend-owner-${ownerId}@example.com`, firstName: "Owner", lastName: "Test" },
        { id: employeeId, email: `integration-suspend-employee-${employeeId}@example.com`, firstName: "Employee", lastName: "Test" },
      ],
    });
    await prisma.businessCategory.create({
      data: { id: categoryId, name: "Integration Suspend Category", slug: `integration-suspend-category-${categoryId}` },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Integration Suspend Org" },
    });
  });

  afterAll(async () => {
    await prisma.turn.deleteMany({ where: { business: { ownerUserId: ownerId } } });
    await prisma.businessEmployee.deleteMany({ where: { userId: { in: [ownerId, employeeId] } } });
    await prisma.refreshSession.deleteMany({ where: { userId: { in: [ownerId, employeeId] } } });
    await prisma.queue.deleteMany({ where: { business: { ownerUserId: ownerId } } });
    await prisma.business.deleteMany({ where: { ownerUserId: ownerId } });
    await prisma.businessCategory.deleteMany({ where: { id: categoryId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeId] } } });
    await prisma.$disconnect();
  });

  it("commits the status flip, both session revocations and both turn cancellations together", async () => {
    const { businessId, turnA, turnB } = await seedScenario();

    const result = await buildUseCase().execute({
      businessId,
      suspendedByUserId: randomUUID(),
      reason: "Integration test",
    });

    expect(result.status).toBe("suspended");

    const [ownerSession, employeeSession, reloadedTurnA, reloadedTurnB] = await Promise.all([
      prisma.refreshSession.findFirst({ where: { userId: ownerId } }),
      prisma.refreshSession.findFirst({ where: { userId: employeeId } }),
      turnRepo.findById(turnA.id),
      turnRepo.findById(turnB.id),
    ]);

    expect(ownerSession?.revokedAt).not.toBeNull();
    expect(employeeSession?.revokedAt).not.toBeNull();
    expect(reloadedTurnA?.status).toBe("cancelled");
    expect(reloadedTurnB?.status).toBe("cancelled");
  });

  it("rolls back the status flip and the first turn's cancellation when a later write fails mid-transaction", async () => {
    const { businessId, turnA, turnB } = await seedScenario();

    let saveCount = 0;
    const poisonedTurnRepo = new PostgresTurnRepo();
    const originalSave = poisonedTurnRepo.save.bind(poisonedTurnRepo);
    poisonedTurnRepo.save = async (entity: Turn, tx?: TransactionHandle) => {
      saveCount += 1;
      if (saveCount === 2) throw new Error("simulated mid-transaction failure");
      return originalSave(entity, tx);
    };

    await expect(
      buildUseCase({ turnRepo: poisonedTurnRepo }).execute({
        businessId,
        suspendedByUserId: randomUUID(),
        reason: "Integration test rollback",
      }),
    ).rejects.toThrow("simulated mid-transaction failure");

    const [business, reloadedTurnA, reloadedTurnB] = await Promise.all([
      businessRepo.findById(businessId),
      turnRepo.findById(turnA.id),
      turnRepo.findById(turnB.id),
    ]);

    expect(business?.status).toBe("approved");
    // Whichever turn saved first inside the (now rolled-back) transaction
    // must be back to "waiting" — proving the DB, not just the app, undid it.
    expect(reloadedTurnA?.status).toBe("waiting");
    expect(reloadedTurnB?.status).toBe("waiting");
  });
});
