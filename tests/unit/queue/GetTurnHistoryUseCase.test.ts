import { describe, expect, it } from "vitest";

import { GetTurnHistoryUseCase } from "../../../src/modules/queue/application/GetTurnHistoryUseCase";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const DATE_STR = "2026-01-15";
const DATE_UTC = new Date("2026-01-15T00:00:00.000Z");

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?:  InMemoryTurnRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const turnRepo  = options.turnRepo  ?? new InMemoryTurnRepo();
  return new GetTurnHistoryUseCase(queueRepo, turnRepo);
};

const calledAt   = new Date("2026-01-15T09:05:00.000Z");
const attendedAt = new Date("2026-01-15T09:10:00.000Z");

describe("GetTurnHistoryUseCase — listado", () => {
  it("returns empty array when no completed turns exist", async () => {
    const result = await buildUseCase().execute({ queueId: QUEUE_ID, date: DATE_STR });
    expect(result).toEqual([]);
  });

  it("returns completed turns with correct shape", async () => {
    const createdAt = new Date("2026-01-15T09:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-1", queueId: QUEUE_ID, displayNumber: "A-001",
        status: "completed", turnDate: DATE_UTC,
        createdAt, calledAt, attendedAt,
        guestName: "Juan",
      }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      turnId:        "t-1",
      displayNumber: "A-001",
      customerName:  null,
      guestName:     "Juan",
      status:        "completed",
      calledAt,
      attendedAt,
      waitMinutes:   5,
    });
  });

  it("excludes waiting and called turns, but includes cancelled ones for traceability", async () => {
    const cancelledAt = new Date("2026-01-15T09:03:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-w", queueId: QUEUE_ID, status: "waiting",   turnDate: DATE_UTC }),
      buildTurn({ id: "t-c", queueId: QUEUE_ID, status: "called",    turnDate: DATE_UTC }),
      buildTurn({ id: "t-x", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC, cancelledAt }),
      buildTurn({ id: "t-ok", queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC, calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result.map((r) => r.turnId).sort()).toEqual(["t-ok", "t-x"]);
  });

  it("returns a cancelled turn with a null attendedAt/waitMinutes and its cancelledAt", async () => {
    const createdAt = new Date("2026-01-15T09:00:00.000Z");
    const cancelledAt = new Date("2026-01-15T09:02:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-x", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC,
        createdAt, cancelledAt, guestName: "María",
      }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      turnId:      "t-x",
      status:      "cancelled",
      calledAt:    null,
      attendedAt:  null,
      cancelledAt,
      waitMinutes: null,
    });
  });

  it("computes waitMinutes for a cancelled turn that was called before giving up", async () => {
    const createdAt = new Date("2026-01-15T09:00:00.000Z");
    const called     = new Date("2026-01-15T09:08:00.000Z"); // 8 min later
    const cancelledAt = new Date("2026-01-15T09:09:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-x", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC,
        createdAt, calledAt: called, cancelledAt,
      }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result[0].waitMinutes).toBe(8);
  });

  it("excludes turns from a different date", async () => {
    const otherDate = new Date("2026-01-14T00:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-other", queueId: QUEUE_ID, status: "completed", turnDate: otherDate, calledAt, attendedAt }),
      buildTurn({ id: "t-ok",    queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC,  calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result).toHaveLength(1);
    expect(result[0].turnId).toBe("t-ok");
  });

  it("defaults to today when no date is provided", async () => {
    const now      = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-today", queueId: QUEUE_ID, status: "completed", turnDate: todayUTC, calledAt, attendedAt }),
      buildTurn({ id: "t-old",   queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC, calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result).toHaveLength(1);
    expect(result[0].turnId).toBe("t-today");
  });

  it("orders results by createdAt ascending, regardless of status", async () => {
    const t1CreatedAt = new Date("2026-01-15T08:50:00.000Z");
    const t2CreatedAt = new Date("2026-01-15T09:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-2", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC, createdAt: t2CreatedAt, cancelledAt: t2CreatedAt }),
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC, createdAt: t1CreatedAt, calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result[0].turnId).toBe("t-1");
    expect(result[1].turnId).toBe("t-2");
  });

  it("computes waitMinutes as time from createdAt to calledAt", async () => {
    const createdAt = new Date("2026-01-15T09:00:00.000Z");
    const called    = new Date("2026-01-15T09:12:00.000Z"); // 12 min later
    const attended  = new Date("2026-01-15T09:17:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC, createdAt, calledAt: called, attendedAt: attended }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, date: DATE_STR });

    expect(result[0].waitMinutes).toBe(12);
  });
});

describe("GetTurnHistoryUseCase — errores", () => {
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
      buildUseCase().execute({ queueId: QUEUE_ID, date: "15-01-2026" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
