import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CreateTurnUseCase } from "../../src/modules/queue/application/CreateTurnUseCase";
import { PostgresQueueRepo } from "../../src/modules/queue/infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../../src/modules/queue/infrastructure/PostgresTurnRepo";
import { PostgresBusinessRepo } from "../../src/modules/business/infrastructure/PostgresBusinessRepo";
import { PostgresBusinessHoursRepo } from "../../src/modules/business/infrastructure/PostgresBusinessHoursRepo";
import { BusinessAvailabilityService } from "../../src/modules/business/domain/BusinessAvailabilityService";
import { prisma } from "../../src/shared/infrastructure/prisma";

/**
 * Proves the partial unique index (migration
 * 20260918010000_unique_active_turn_per_customer) actually closes the race
 * against real Postgres: two truly concurrent turn requests for the same
 * customer — across two different businesses, since the invariant is
 * system-wide by design — must settle on a single active turn, never two.
 */
describe("CreateTurnUseCase (real Postgres unique index)", () => {
  const customerId = randomUUID();
  const categoryId = randomUUID();
  const organizationId = randomUUID();
  const businessAId = randomUUID();
  const businessBId = randomUUID();
  const queueAId = randomUUID();
  const queueBId = randomUUID();

  const useCase = new CreateTurnUseCase(
    new PostgresQueueRepo(),
    new PostgresTurnRepo(),
    new PostgresBusinessRepo(),
    new PostgresBusinessHoursRepo(),
    new BusinessAvailabilityService(),
  );

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: customerId, email: `integration-turn-customer-${customerId}@example.com`, firstName: "Turn", lastName: "Customer" },
    });
    await prisma.businessCategory.create({
      data: { id: categoryId, name: "Integration Turn Category", slug: `integration-turn-category-${categoryId}` },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Integration Turn Org" },
    });
    await prisma.business.createMany({
      data: [businessAId, businessBId].map((id) => ({
        id,
        name: `Integration Turn Business ${id}`,
        slug: `integration-turn-business-${id}`,
        categoryId,
        ownerUserId: customerId,
        organizationId,
        status: "APPROVED",
      })),
    });
    await prisma.queue.createMany({
      data: [
        { id: queueAId, businessId: businessAId, name: "Queue A", prefix: "A" },
        { id: queueBId, businessId: businessBId, name: "Queue B", prefix: "B" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.turn.deleteMany({ where: { customerId } });
    await prisma.queue.deleteMany({ where: { businessId: { in: [businessAId, businessBId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [businessAId, businessBId] } } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.businessCategory.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("settles on a single active turn for two truly concurrent requests at different businesses", async () => {
    const results = await Promise.allSettled([
      useCase.execute({ queueId: queueAId, customerId }),
      useCase.execute({ queueId: queueBId, customerId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      statusCode: 409,
      code: "CUSTOMER_HAS_ACTIVE_TURN",
    });

    const activeTurns = await prisma.turn.findMany({
      where: { customerId, status: { in: ["WAITING", "CALLED", "ATTENDING", "REDIRECTED"] } },
    });
    expect(activeTurns).toHaveLength(1);
  });
});
