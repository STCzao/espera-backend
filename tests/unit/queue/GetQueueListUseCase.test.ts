import { describe, expect, it } from "vitest";

import { GetQueueListUseCase } from "../../../src/modules/queue/application/GetQueueListUseCase";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue, buildTurn } from "../../helpers/queueFakes";

const QUEUE_ID   = "11111111-1111-4111-8111-111111111111";
const TODAY      = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const turnRepo  = options.turnRepo  ?? new InMemoryTurnRepo();
  return { useCase: new GetQueueListUseCase(queueRepo, turnRepo), turnRepo };
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
