import { describe, expect, it } from "vitest";

import { GetQueueMetricsUseCase } from "../../../src/modules/queue/application/GetQueueMetricsUseCase";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const DATE_STR = "2026-03-10";
const DATE_UTC = new Date("2026-03-10T00:00:00.000Z");
const PREV_UTC = new Date("2026-03-09T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?:  InMemoryTurnRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const turnRepo  = options.turnRepo  ?? new InMemoryTurnRepo();
  return new GetQueueMetricsUseCase(queueRepo, turnRepo);
};

const completedTurn = (id: string, date: Date, startHour: number, serviceMinutes: number) => {
  const startedAttentionAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), startHour, 0, 0));
  const attendedAt         = new Date(startedAttentionAt.getTime() + serviceMinutes * 60_000);
  return buildTurn({ id, queueId: QUEUE_ID, status: "completed", turnDate: date, startedAttentionAt, attendedAt });
};

describe("GetQueueMetricsUseCase — métricas vacías", () => {
  it("returns zero metrics when there are no turns", async () => {
    const result = await buildUseCase().execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.date).toBe(DATE_STR);
    expect(result.today).toMatchObject({
      completedCount:    0,
      cancelledCount:    0,
      noShowCount:       0,
      totalCount:        0,
      cancellationRate:  0,
      noShowRate:        0,
      avgServiceMinutes: null,
      peakHour:          null,
    });
    expect(result.yesterday).toMatchObject({ completedCount: 0, cancelledCount: 0 });
  });
});

describe("GetQueueMetricsUseCase — completedCount y cancelledCount", () => {
  it("counts completed and cancelled turns correctly", async () => {
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9, 5),
      completedTurn("t-2", DATE_UTC, 10, 5),
      buildTurn({ id: "t-c1", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-c2", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-c3", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.completedCount).toBe(2);
    expect(result.today.cancelledCount).toBe(3);
    expect(result.today.totalCount).toBe(5);
  });

  it("ignores waiting and called turns", async () => {
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-done", DATE_UTC, 9, 5),
      buildTurn({ id: "t-w", queueId: QUEUE_ID, status: "waiting", turnDate: DATE_UTC }),
      buildTurn({ id: "t-c", queueId: QUEUE_ID, status: "called",  turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.completedCount).toBe(1);
    expect(result.today.cancelledCount).toBe(0);
  });
});

describe("GetQueueMetricsUseCase — noShowCount", () => {
  it("counts no_show turns separately from completed and cancelled", async () => {
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9, 5),
      buildTurn({ id: "t-c1", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-ns1", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC }),
      buildTurn({ id: "t-ns2", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.completedCount).toBe(1);
    expect(result.today.cancelledCount).toBe(1);
    expect(result.today.noShowCount).toBe(2);
    expect(result.today.totalCount).toBe(4);
  });

  it("does not count a no_show turn as a completed attention (excluded from avgServiceMinutes)", async () => {
    // A no_show turn never has startedAttentionAt/attendedAt — it must not
    // silently count toward the service-time average.
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9, 10),
      buildTurn({ id: "t-ns", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.avgServiceMinutes).toBe(10);
  });
});

describe("GetQueueMetricsUseCase — noShowRate", () => {
  it("computes no-show rate as a percentage of all closed turns", async () => {
    // 1 completed + 1 cancelled + 2 no_show = 4 total → 50%
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9, 5),
      buildTurn({ id: "t-c1", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-ns1", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC }),
      buildTurn({ id: "t-ns2", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.noShowRate).toBe(50);
  });
});

describe("GetQueueMetricsUseCase — cancellationRate", () => {
  it("computes cancellation rate as percentage of closed turns", async () => {
    // 1 completed + 3 cancelled = 4 total → 75%
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9, 5),
      buildTurn({ id: "t-c1", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-c2", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
      buildTurn({ id: "t-c3", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.cancellationRate).toBe(75);
  });

  it("returns 0 rate when there are no closed turns", async () => {
    const result = await buildUseCase().execute({ queueId: QUEUE_ID, date: DATE_STR });
    expect(result.today.cancellationRate).toBe(0);
  });
});

describe("GetQueueMetricsUseCase — avgServiceMinutes", () => {
  it("returns null when there are no completed turns", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-c", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.avgServiceMinutes).toBeNull();
  });

  it("computes average service time from startedAttentionAt to attendedAt", async () => {
    // 6 min + 10 min = avg 8 min
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9,  6),
      completedTurn("t-2", DATE_UTC, 10, 10),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.avgServiceMinutes).toBe(8);
  });
});

describe("GetQueueMetricsUseCase — peakHour", () => {
  it("returns null when there are no completed turns", async () => {
    const result = await buildUseCase().execute({ queueId: QUEUE_ID, date: DATE_STR });
    expect(result.today.peakHour).toBeNull();
  });

  it("returns the hour with the most completed turns", async () => {
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 9,  5),
      completedTurn("t-2", DATE_UTC, 11, 5),
      completedTurn("t-3", DATE_UTC, 11, 5),
      completedTurn("t-4", DATE_UTC, 11, 5),
      completedTurn("t-5", DATE_UTC, 14, 5),
      completedTurn("t-6", DATE_UTC, 14, 5),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    // Buenos Aires is UTC-3 (no DST): the busiest UTC hour (11, with 3 turns)
    // is 8am local — peakHour must reflect the business's local time, not UTC.
    expect(result.today.peakHour).toBe(8);
  });

  it("reports the peak hour in the business's local time, not UTC", async () => {
    // A single completed turn at 01:00 UTC is 22:00 the previous day in
    // Buenos Aires (UTC-3) — this is exactly the case a naive getUTCHours()
    // would get wrong (it would say "1", not "22").
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-1", DATE_UTC, 1, 5),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.peakHour).toBe(22);
  });
});

describe("GetQueueMetricsUseCase — comparativa yesterday", () => {
  it("returns yesterday metrics from the day before the requested date", async () => {
    const turnRepo = new InMemoryTurnRepo([
      completedTurn("t-today",     DATE_UTC, 9, 5),
      completedTurn("t-yesterday", PREV_UTC, 9, 5),
      buildTurn({ id: "t-c-y", queueId: QUEUE_ID, status: "cancelled", turnDate: PREV_UTC }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.today.completedCount).toBe(1);
    expect(result.yesterday.completedCount).toBe(1);
    expect(result.yesterday.cancelledCount).toBe(1);
  });
});

describe("GetQueueMetricsUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const useCase = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, date: DATE_STR }),
    ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    await expect(
      buildUseCase().execute({ queueId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws BAD_REQUEST for an invalid date format", async () => {
    await expect(
      buildUseCase().execute({ queueId: QUEUE_ID, date: "10/03/2026" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
