import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PostgresTurnRepo } from "../../src/modules/queue/infrastructure/PostgresTurnRepo";
import { prisma } from "../../src/shared/infrastructure/prisma";
import type { CreateTurnData, ITurnRepo } from "../../src/modules/queue/domain/ITurnRepo";
import type { TurnPriority } from "../../src/modules/queue/domain/Turn";

/**
 * PostgresTurnRepo carries the riskiest SQL in the project — priority
 * ranking, enum round-trips, "intentionally counts future reservations"
 * semantics (see ITurnRepo.ts) — and was the top candidate flagged for
 * integration coverage after PostgresUserRepo. Requires
 * `npm run test:integration:setup` to have applied migrations first.
 *
 * The first test below is a regression test for a real bug this exact
 * suite motivated fixing: `toTurn`/`findActiveByQueue`/`findRecentCalls`
 * used to map Prisma's `IN_TRANSIT` to `"in-transit"` (hyphen) instead of
 * the domain's `"in_transit"` (underscore) — invisible to the unit suite
 * because the in-memory fake never goes through a Prisma round-trip at
 * all. Fixed in PostgresTurnRepo.ts; this test would have caught it.
 */
describe("PostgresTurnRepo (real Postgres)", () => {
  const repo: ITurnRepo = new PostgresTurnRepo();

  const ownerId = randomUUID();
  const categoryId = randomUUID();
  const organizationId = randomUUID();
  const businessId = randomUUID();
  const queueId = randomUUID();
  const createdTurnIds: string[] = [];

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `integration-turn-owner-${ownerId}@example.com`,
        firstName: "Turn",
        lastName: "Owner",
      },
    });
    await prisma.businessCategory.create({
      data: { id: categoryId, name: "Integration Test Category", slug: `integration-test-${categoryId}` },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Integration Test Org" },
    });
    await prisma.business.create({
      data: {
        id: businessId,
        name: "Integration Test Business",
        slug: `integration-test-business-${businessId}`,
        categoryId,
        ownerUserId: ownerId,
        organizationId,
        status: "APPROVED",
      },
    });
    await prisma.queue.create({
      data: { id: queueId, businessId, name: "Integration Test Queue", prefix: "T" },
    });
  });

  afterEach(async () => {
    if (createdTurnIds.length === 0) return;
    await prisma.turn.deleteMany({ where: { id: { in: createdTurnIds } } });
    createdTurnIds.length = 0;
  });

  afterAll(async () => {
    await prisma.queue.delete({ where: { id: queueId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.businessCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  const buildTurnData = (overrides: Partial<CreateTurnData> = {}): CreateTurnData => ({
    queueId,
    businessId,
    guestName: "Integration Guest",
    priority: "registered",
    source: "app",
    turnDate: new Date(),
    prefix: "T",
    queueJoinedAt: new Date(),
    ...overrides,
  });

  it.each<TurnPriority>(["arrived", "physical", "in_transit", "registered"])(
    "round-trips priority %s exactly through Postgres's enum",
    async (priority) => {
      const created = await repo.createWithNextNumber(buildTurnData({ priority }));
      createdTurnIds.push(created.id);

      expect(created.priority).toBe(priority);

      const reloaded = await repo.findById(created.id);
      expect(reloaded?.priority).toBe(priority);
    },
  );

  it("sorts findActiveByQueue by priority rank, not creation order", async () => {
    const low = await repo.createWithNextNumber(buildTurnData({ priority: "registered" }));
    const high = await repo.createWithNextNumber(buildTurnData({ priority: "arrived" }));
    const mid = await repo.createWithNextNumber(buildTurnData({ priority: "in_transit" }));
    createdTurnIds.push(low.id, high.id, mid.id);

    const active = await repo.findActiveByQueue(queueId);
    const ids = active.map((t) => t.turnId);

    expect(ids.indexOf(high.id)).toBeLessThan(ids.indexOf(mid.id));
    expect(ids.indexOf(mid.id)).toBeLessThan(ids.indexOf(low.id));
    expect(active.find((t) => t.turnId === mid.id)?.priority).toBe("in_transit");
  });

  it("countWaitingAhead counts higher-priority turns ahead of a registered one", async () => {
    const ahead = await repo.createWithNextNumber(buildTurnData({ priority: "physical" }));
    const mine = await repo.createWithNextNumber(buildTurnData({ priority: "registered" }));
    createdTurnIds.push(ahead.id, mine.id);

    const count = await repo.countWaitingAhead(queueId, mine.queueJoinedAt, mine.number, "registered");

    expect(count).toBeGreaterThanOrEqual(1);
  });
});
