import { describe, expect, it } from "vitest";

import { GetQueueListUseCase } from "../../../src/modules/queue/application/GetQueueListUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue, buildTurn } from "../../helpers/queueFakes";

const QUEUE_ID    = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "business-1";
const TODAY       = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?:    InMemoryQueueRepo;
  turnRepo?:     InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo    = options.queueRepo    ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const turnRepo     = options.turnRepo     ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 1 })]);
  return { useCase: new GetQueueListUseCase(queueRepo, turnRepo, businessRepo), turnRepo };
};

describe("GetQueueListUseCase — lista de turnos", () => {
  it("returns an empty list when no active turns exist", async () => {
    const { useCase } = buildUseCase();
    const result = await useCase.execute({ queueId: QUEUE_ID });
    expect(result).toEqual({ queueId: QUEUE_ID, items: [] });
  });

  it("returns waiting and called turns, not cancelled or completed", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting",   turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "called",    turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, number: 3, status: "cancelled", turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, number: 4, status: "completed", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.turnId)).toEqual(["t-1", "t-2"]);
  });

  it("orders by priority rank then FIFO within same priority", async () => {
    const base = TODAY.getTime();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-reg",     queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 1000), turnDate: TODAY }),
      buildTurn({ id: "t-transit", queueId: QUEUE_ID, priority: "in_transit", createdAt: new Date(base + 2000), turnDate: TODAY }),
      buildTurn({ id: "t-arrived", queueId: QUEUE_ID, priority: "arrived",    createdAt: new Date(base + 3000), turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items.map((i) => i.priority)).toEqual(["arrived", "in_transit", "registered"]);
  });

  it("resolves FIFO within the same priority", async () => {
    const base = TODAY.getTime();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-late",  queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 2000), turnDate: TODAY }),
      buildTurn({ id: "t-early", queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 1000), turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items.map((i) => i.turnId)).toEqual(["t-early", "t-late"]);
  });

  it("includes displayNumber, priority and status in each item", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, displayNumber: "A-007", priority: "in_transit", status: "called", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0]).toMatchObject({
      turnId:        "t-1",
      displayNumber: "A-007",
      priority:      "in_transit",
      status:        "called",
    });
  });

  it("includes guestName for manual turns", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, guestName: "Juan Pérez", source: "manual", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].guestName).toBe("Juan Pérez");
  });

  it("computes waitingMinutes as elapsed time since createdAt", async () => {
    const createdAt = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const turnRepo  = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, createdAt, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].waitingMinutes).toBeGreaterThanOrEqual(9);
    expect(result.items[0].waitingMinutes).toBeLessThanOrEqual(11);
  });

  it("does not include turns from other queues", async () => {
    const OTHER_QUEUE = "22222222-2222-4222-8222-222222222222";
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-mine",  queueId: QUEUE_ID,   turnDate: TODAY }),
      buildTurn({ id: "t-other", queueId: OTHER_QUEUE, turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].turnId).toBe("t-mine");
  });
});

describe("GetQueueListUseCase — estimatedWaitMinutes", () => {
  it("assigns estimate based on position for each waiting turn", async () => {
    // 1 window, avg=5 min (default) → pos 1 = 1 batch = 5 min, pos 2 = 2 batches = 10 min
    const base = TODAY.getTime();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 1000), turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 2000), turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBe(5);
    expect(result.items[1].estimatedWaitMinutes).toBe(10);
  });

  it("respects priority order when assigning positions", async () => {
    // arrived (pos 1) gets lower estimate than registered (pos 2)
    const base = TODAY.getTime();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-reg",     queueId: QUEUE_ID, priority: "registered", createdAt: new Date(base + 1000), turnDate: TODAY }),
      buildTurn({ id: "t-arrived", queueId: QUEUE_ID, priority: "arrived",    createdAt: new Date(base + 2000), turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].priority).toBe("arrived");
    expect(result.items[0].estimatedWaitMinutes).toBe(5);  // pos 1
    expect(result.items[1].priority).toBe("registered");
    expect(result.items[1].estimatedWaitMinutes).toBe(10); // pos 2
  });

  it("uses averageServiceMinutes from completed turns when available", async () => {
    // turnDate must match todayUTC() so getAverageServiceMinutes picks them up
    const now = new Date();
    const realToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const t0 = realToday.getTime();

    // 2 completed turns with 10 min service each → avg=10 min, pos 1 → 10 min
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "c-1", queueId: QUEUE_ID, status: "completed", turnDate: realToday,
        calledAt: new Date(t0 + 0 * 60_000), attendedAt: new Date(t0 + 10 * 60_000) }),
      buildTurn({ id: "c-2", queueId: QUEUE_ID, status: "completed", turnDate: realToday,
        calledAt: new Date(t0 + 10 * 60_000), attendedAt: new Date(t0 + 20 * 60_000) }),
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting",   turnDate: realToday }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBe(10);
  });

  it("returns null for called turns (already being attended)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "called", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBeNull();
  });

  it("returns null when there are no active service windows", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 0 }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, businessRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBeNull();
  });

  it("uses DEFAULT_SERVICE_MINUTES (5) when no completed turns exist yet", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBe(5);
  });

  it("benefits from multiple service windows (parallel processing)", async () => {
    // 2 windows, default 5 min: pos 1 = ceil(1/2)=1 batch = 5, pos 2 = ceil(2/2)=1 batch = 5
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 2 }),
    ]);
    const base = TODAY.getTime();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", createdAt: new Date(base + 1000), turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting", createdAt: new Date(base + 2000), turnDate: TODAY }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, businessRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.items[0].estimatedWaitMinutes).toBe(5);
    expect(result.items[1].estimatedWaitMinutes).toBe(5);
  });
});

describe("GetQueueListUseCase — errores", () => {
  it("throws 404 when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
