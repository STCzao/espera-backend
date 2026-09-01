import { describe, expect, it } from "vitest";

import { EnsureBusinessMembershipUseCase } from "../../../src/modules/business/application/EnsureBusinessMembershipUseCase";
import { GetTurnHistoryUseCase } from "../../../src/modules/queue/application/GetTurnHistoryUseCase";
import { InMemoryBusinessEmployeeRepo, InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "business-1"; // matches buildQueue() default
const DATE_STR = "2026-01-15";
const DATE_UTC = new Date("2026-01-15T00:00:00.000Z");
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?:  InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const turnRepo  = options.turnRepo  ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const ensureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(
    businessRepo,
    new InMemoryBusinessEmployeeRepo(),
  );
  return new GetTurnHistoryUseCase(queueRepo, turnRepo, ensureBusinessMembershipUseCase);
};

const calledAt   = new Date("2026-01-15T09:05:00.000Z");
const attendedAt = new Date("2026-01-15T09:10:00.000Z");

describe("GetTurnHistoryUseCase — listado", () => {
  it("returns empty array when no completed turns exist", async () => {
    const result = await buildUseCase().execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });
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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

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

  it("excludes waiting and called turns, but includes cancelled and no_show ones for traceability", async () => {
    const cancelledAt = new Date("2026-01-15T09:03:00.000Z");
    const noShowAt     = new Date("2026-01-15T09:04:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-w", queueId: QUEUE_ID, status: "waiting",   turnDate: DATE_UTC }),
      buildTurn({ id: "t-c", queueId: QUEUE_ID, status: "called",    turnDate: DATE_UTC }),
      buildTurn({ id: "t-x", queueId: QUEUE_ID, status: "cancelled", turnDate: DATE_UTC, cancelledAt }),
      buildTurn({ id: "t-ns", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC, calledAt, noShowAt }),
      buildTurn({ id: "t-ok", queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC, calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

    expect(result.map((r) => r.turnId).sort()).toEqual(["t-ns", "t-ok", "t-x"]);
  });

  it("returns a no_show turn distinct from a completed one, with its noShowAt and no attendedAt", async () => {
    const noShowAt = new Date("2026-01-15T09:07:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-ns", queueId: QUEUE_ID, status: "no_show", turnDate: DATE_UTC,
        calledAt, noShowAt, guestName: "Pedro",
      }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      turnId:     "t-ns",
      status:     "no_show",
      calledAt,
      attendedAt: null,
      noShowAt,
    });
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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

    expect(result[0].waitMinutes).toBe(8);
  });

  it("excludes turns from a different date", async () => {
    const otherDate = new Date("2026-01-14T00:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-other", queueId: QUEUE_ID, status: "completed", turnDate: otherDate, calledAt, attendedAt }),
      buildTurn({ id: "t-ok",    queueId: QUEUE_ID, status: "completed", turnDate: DATE_UTC,  calledAt, attendedAt }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

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

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR });

    expect(result[0].waitMinutes).toBe(12);
  });
});

describe("GetTurnHistoryUseCase — errores", () => {
  it("throws NOT_FOUND when the queue does not exist", async () => {
    const useCase = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: DATE_STR }),
    ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    await expect(
      buildUseCase().execute({ queueId: "not-a-uuid", requestingUserId: OWNER_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws BAD_REQUEST for an invalid date format", async () => {
    await expect(
      buildUseCase().execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID, date: "15-01-2026" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws BUSINESS_MEMBERSHIP_REQUIRED for a user unrelated to the business", async () => {
    await expect(
      buildUseCase().execute({ queueId: QUEUE_ID, requestingUserId: STRANGER_ID, date: DATE_STR }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
  });
});
