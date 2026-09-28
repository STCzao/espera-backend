import { describe, expect, it } from "vitest";

import { GetMyTurnUseCase } from "../../../src/modules/queue/application/GetMyTurnUseCase";
import {
  InMemoryQueueRepo,
  InMemoryServiceWindowRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildServiceWindow,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
const TODAY = new Date("2026-01-01T00:00:00.000Z");

const oneActiveWindow = () => new InMemoryServiceWindowRepo([
  buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
]);

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const queueRepo =
    options.queueRepo ??
    new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const windowRepo = options.windowRepo ?? oneActiveWindow();
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  return { useCase: new GetMyTurnUseCase(queueRepo, turnRepo, windowRepo), turnRepo };
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

  it("does not inflate position with a phone reservation whose ETA hasn't arrived yet (HU-4.5 fairness)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-live", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1,
        turnDate: TODAY, queueJoinedAt: TODAY,
      }),
      // Reserved for 6 hours later — still counts as "ahead" for anyone who
      // joins after it, but must not push back someone already in line.
      buildTurn({
        id: "t-phone", queueId: QUEUE_ID, number: 2, source: "phone",
        turnDate: TODAY, queueJoinedAt: new Date(TODAY.getTime() + 6 * 60 * 60 * 1000),
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(1);
  });

  it("returns position 0 and status called when the turn is being called", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "called", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ status: "called", position: 0, estimatedWaitMinutes: 0 });
  });

  it("returns position 0 and status attending when the turn is being attended", async () => {
    const WINDOW_ID = "77777777-7777-4777-8777-777777777777";
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "attending", serviceWindowId: WINDOW_ID, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ status: "attending", position: 0, estimatedWaitMinutes: 0, serviceWindowId: WINDOW_ID });
  });

  it("returns position 0 and status redirected when the turn is being moved to another window", async () => {
    const WINDOW_ID = "88888888-8888-4888-8888-888888888888";
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "redirected", serviceWindowId: WINDOW_ID, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result).toMatchObject({ status: "redirected", position: 0, estimatedWaitMinutes: 0, serviceWindowId: WINDOW_ID });
  });

  it("returns serviceWindowId null for a waiting turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "waiting", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.serviceWindowId).toBeNull();
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

  it("returns null when there are no active service windows", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: false }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, status: "waiting", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.estimatedWaitMinutes).toBeNull();
  });

  it("divides wait across multiple service windows", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
      buildServiceWindow({ id: "window-2", queueId: QUEUE_ID, isActive: true }),
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
    const { useCase } = buildUseCase({ turnRepo, windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.estimatedWaitMinutes).toBe(10);
  });
});

describe("GetMyTurnUseCase — HU-3.12 jerarquía de prioridad en posición", () => {
  const CUSTOMER_B = "44444444-4444-4444-8444-444444444444";
  const CUSTOMER_C = "55555555-5555-4555-8555-555555555555";
  const CUSTOMER_D = "66666666-6666-4666-8666-666666666666";

  it("arrived turn jumps ahead of registered turns with lower number", async () => {
    // B registers first (number 1, registered), A arrives later (number 2, arrived)
    // A should be position 1 because arrived > registered
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-b", queueId: QUEUE_ID, customerId: CUSTOMER_B, number: 1, priority: "registered", status: "waiting" }),
      buildTurn({ id: "t-a", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 2, priority: "arrived",    status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID });

    expect(result.position).toBe(1);
  });

  it("full priority order: arrived(1) > physical(2) > in_transit(3) > registered(4)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-a", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 1, priority: "registered", status: "waiting" }),
      buildTurn({ id: "t-b", queueId: QUEUE_ID, customerId: CUSTOMER_B,  number: 2, priority: "in_transit", status: "waiting" }),
      buildTurn({ id: "t-c", queueId: QUEUE_ID, customerId: CUSTOMER_C,  number: 3, priority: "physical",   status: "waiting" }),
      buildTurn({ id: "t-d", queueId: QUEUE_ID, customerId: CUSTOMER_D,  number: 4, priority: "arrived",    status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const [rD, rC, rB, rA] = await Promise.all([
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_D }),  // arrived → 1
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_C }),  // physical → 2
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_B }),  // in_transit → 3
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }), // registered → 4
    ]);

    expect(rD.position).toBe(1);
    expect(rC.position).toBe(2);
    expect(rB.position).toBe(3);
    expect(rA.position).toBe(4);
  });

  it("manual turn (physical priority) beats registered but loses to arrived", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-r",  queueId: QUEUE_ID, customerId: CUSTOMER_B,  number: 1, priority: "registered", status: "waiting" }),
      buildTurn({ id: "t-m",  queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 2, priority: "physical",   status: "waiting", source: "manual" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const [rManual, rRegistered] = await Promise.all([
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_B }),
    ]);

    expect(rManual.position).toBe(1);
    expect(rRegistered.position).toBe(2);
  });

  it("FIFO resolves ties within same priority", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, customerId: CUSTOMER_B,  number: 3, priority: "in_transit", status: "waiting" }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, customerId: CUSTOMER_ID, number: 7, priority: "in_transit", status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const [rFirst, rSecond] = await Promise.all([
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_B }),
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ]);

    expect(rFirst.position).toBe(1);
    expect(rSecond.position).toBe(2);
  });
});

describe("GetMyTurnUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws NOT_FOUND when the customer has no active turn in this queue", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid", customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
