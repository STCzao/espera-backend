import { describe, expect, it } from "vitest";

import { GetQueueStatusUseCase } from "../../../src/modules/queue/application/GetQueueStatusUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import {
  InMemoryQueueRepo,
  InMemoryServiceWindowRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildServiceWindow,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID    = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const TODAY       = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?:    InMemoryQueueRepo;
  turnRepo?:     InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
  windowRepo?:   InMemoryServiceWindowRepo;
} = {}) => {
  const queueRepo    = options.queueRepo    ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const turnRepo     = options.turnRepo     ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, operationalStatus: "normal" })]);
  const windowRepo   = options.windowRepo   ?? new InMemoryServiceWindowRepo([
    buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
  ]);
  return new GetQueueStatusUseCase(queueRepo, turnRepo, businessRepo, windowRepo);
};

describe("GetQueueStatusUseCase — estado básico", () => {
  it("returns zero counts when the queue is empty", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result).toMatchObject({
      queueId:              QUEUE_ID,
      businessId:           BUSINESS_ID,
      operationalStatus:    "normal",
      activeServiceWindows: 1,
      waitingCount:         0,
      calledCount:          0,
      attendingCount:       0,
    });
  });

  it("counts waiting, called, attending and redirected turns separately", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting",    turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting",    turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, status: "called",     turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, status: "attending",  turnDate: TODAY }),
      buildTurn({ id: "t-5", queueId: QUEUE_ID, status: "redirected", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.waitingCount).toBe(2);
    expect(result.calledCount).toBe(1);
    expect(result.attendingCount).toBe(1);
    expect(result.redirectedCount).toBe(1);
  });

  it("does not count completed or cancelled turns", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-done",      queueId: QUEUE_ID, status: "completed", turnDate: TODAY }),
      buildTurn({ id: "t-cancelled", queueId: QUEUE_ID, status: "cancelled", turnDate: TODAY }),
      buildTurn({ id: "t-waiting",   queueId: QUEUE_ID, status: "waiting",   turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.waitingCount).toBe(1);
    expect(result.calledCount).toBe(0);
  });

  it("reflects the business operationalStatus", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, operationalStatus: "paused" }),
    ]);
    const useCase = buildUseCase({ businessRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.operationalStatus).toBe("paused");
  });
});

describe("GetQueueStatusUseCase — tiempo estimado total", () => {
  it("returns null when there are no active service windows", async () => {
    const windowRepo = new InMemoryServiceWindowRepo();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo, windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.estimatedTotalWaitMinutes).toBeNull();
  });

  it("uses default 5 min when no completed turns exist and computes total", async () => {
    // 4 waiting, 1 window → ceil(4/1) * 5 = 20 min
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.estimatedTotalWaitMinutes).toBe(20);
  });

  it("divides total wait across multiple service windows", async () => {
    // 4 waiting, 2 windows → ceil(4/2) * 5 = 10 min
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
      buildServiceWindow({ id: "window-2", queueId: QUEUE_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo, windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.estimatedTotalWaitMinutes).toBe(10);
  });

  it("uses real average service time from completed turns", async () => {
    const now               = new Date();
    const realToday         = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startedAttentionAt = new Date(realToday.getTime());
    const attendedAt         = new Date(realToday.getTime() + 10 * 60_000); // 10 min service
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-done", queueId: QUEUE_ID, status: "completed", turnDate: realToday, startedAttentionAt, attendedAt }),
      buildTurn({ id: "t-1",    queueId: QUEUE_ID, status: "waiting",   turnDate: TODAY }),
      buildTurn({ id: "t-2",    queueId: QUEUE_ID, status: "waiting",   turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    // 2 waiting, 1 window, 10 min avg → ceil(2/1) * 10 = 20 min
    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.estimatedTotalWaitMinutes).toBe(20);
  });
});

describe("GetQueueStatusUseCase — recentCalls", () => {
  it("returns an empty array when no turn was called yet", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.recentCalls).toEqual([]);
  });

  it("returns the most recent calls ordered desc by calledAt, capped at 5", async () => {
    const base = TODAY.getTime();
    const turns = Array.from({ length: 7 }, (_, i) =>
      buildTurn({
        id: `t-${i}`,
        queueId: QUEUE_ID,
        turnDate: TODAY,
        calledAt: new Date(base + i * 60_000),
      }),
    );
    const turnRepo = new InMemoryTurnRepo(turns);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.recentCalls).toHaveLength(5);
    expect(result.recentCalls.map((c) => c.turnId)).toEqual(["t-6", "t-5", "t-4", "t-3", "t-2"]);
  });

  it("includes serviceWindowId and calledAt as ISO string", async () => {
    const calledAt = new Date(TODAY.getTime());
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, turnDate: TODAY, calledAt, serviceWindowId: "window-1" }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.recentCalls[0]).toMatchObject({
      turnId: "t-1",
      serviceWindowId: "window-1",
      calledAt: calledAt.toISOString(),
    });
  });

  it("does not include turns from other queues or never-called turns", async () => {
    const OTHER_QUEUE = "33333333-3333-4333-8333-333333333333";
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-mine",     queueId: QUEUE_ID,   turnDate: TODAY, calledAt: new Date(TODAY) }),
      buildTurn({ id: "t-other",    queueId: OTHER_QUEUE, turnDate: TODAY, calledAt: new Date(TODAY) }),
      buildTurn({ id: "t-uncalled", queueId: QUEUE_ID,   turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.recentCalls).toHaveLength(1);
    expect(result.recentCalls[0].turnId).toBe("t-mine");
  });
});

describe("GetQueueStatusUseCase — activeServiceWindows real (ventanillas)", () => {
  it("uses the real active window count", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: QUEUE_ID, isActive: true }),
      buildServiceWindow({ id: "w-2", queueId: QUEUE_ID, isActive: true }),
      buildServiceWindow({ id: "w-3", queueId: QUEUE_ID, isActive: false }),
    ]);
    const useCase = buildUseCase({ windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.activeServiceWindows).toBe(2);
  });

  it("returns 0 when the queue has no active windows", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: QUEUE_ID, isActive: false }),
    ]);
    const useCase = buildUseCase({ windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.activeServiceWindows).toBe(0);
  });
});

describe("GetQueueStatusUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const useCase = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
