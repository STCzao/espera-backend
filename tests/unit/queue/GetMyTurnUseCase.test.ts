import { describe, expect, it } from "vitest";

import { GetMyTurnUseCase } from "../../../src/modules/queue/application/GetMyTurnUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
const TODAY = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo =
    options.queueRepo ??
    new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const businessRepo =
    options.businessRepo ??
    new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 1 })]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  return { useCase: new GetMyTurnUseCase(queueRepo, turnRepo, businessRepo), turnRepo };
};

describe("GetMyTurnUseCase — posición", () => {
  it("returns position 1 when the customer is first in line", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ displayNumber: "A-001", status: "waiting", position: 1 });
  });

  it("returns correct position when there are turns ahead", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "waiting", turnDate: TODAY }),
      buildTurn({
        id: "t-3",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 3,
        displayNumber: "A-003",
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(3);
  });

  it("returns position 0 and status called when the turn is being called", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "called", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ status: "called", position: 0, estimatedWaitMinutes: 0 });
  });

  it("does not count cancelled turns as positions ahead", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "cancelled", turnDate: TODAY }),
      buildTurn({
        id: "t-2",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 2,
        displayNumber: "A-002",
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(1);
  });
});

describe("GetMyTurnUseCase — tiempo estimado (HU-3.3)", () => {
  it("returns estimatedWaitMinutes using default 5 min when no completed turns exist", async () => {
    // position 3 → 2 ahead → ceil(2/1) * 5 = 10 min
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "waiting", turnDate: TODAY }),
      buildTurn({
        id: "t-3",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 3,
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.estimatedWaitMinutes).toBe(10);
  });

  it("adapts the estimate to the actual average service time", async () => {
    const calledAt = new Date(TODAY.getTime() + 0);
    const attendedAt = new Date(TODAY.getTime() + 8 * 60_000); // 8 min real average
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-done",
        queueId: QUEUE_ID,
        number: 1,
        status: "completed",
        turnDate: TODAY,
        calledAt,
        attendedAt,
      }),
      buildTurn({
        id: "t-me",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 2,
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    // position 1 → 0 ahead → ceil(0/1) * 8 = 0 min
    expect(result.estimatedWaitMinutes).toBe(0);
  });

  it("returns null when activeServiceWindows is 0", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 0 }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "waiting", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, businessRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.estimatedWaitMinutes).toBeNull();
  });

  it("divides wait across multiple service windows", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 2 }),
    ]);
    // 4 people ahead of me → ceil(4/2) * 5 = 10 min
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, number: 3, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, number: 4, status: "waiting", turnDate: TODAY }),
      buildTurn({
        id: "t-5",
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        number: 5,
        status: "waiting",
        turnDate: TODAY,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, businessRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.estimatedWaitMinutes).toBe(10);
  });
});

describe("GetMyTurnUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws NOT_FOUND when the customer has no active turn in this queue", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid", customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
