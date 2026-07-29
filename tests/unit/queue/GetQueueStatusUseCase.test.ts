import { describe, expect, it } from "vitest";

import { GetQueueStatusUseCase } from "../../../src/modules/queue/application/GetQueueStatusUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID    = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const TODAY       = new Date("2026-01-01T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?:    InMemoryQueueRepo;
  turnRepo?:     InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo    = options.queueRepo    ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const turnRepo     = options.turnRepo     ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 1, operationalStatus: "normal" })]);
  return new GetQueueStatusUseCase(queueRepo, turnRepo, businessRepo);
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

  it("counts waiting, called and attending turns separately", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting",   turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting",   turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, status: "called",    turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, status: "attending", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.waitingCount).toBe(2);
    expect(result.calledCount).toBe(1);
    expect(result.attendingCount).toBe(1);
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
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 0 }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo, businessRepo });

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
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, activeServiceWindows: 2 }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-3", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
      buildTurn({ id: "t-4", queueId: QUEUE_ID, status: "waiting", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo, businessRepo });

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

describe("GetQueueStatusUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const useCase = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
