import { describe, expect, it } from "vitest";

import { GetPlatformMetricsUseCase } from "../../../src/modules/business/application/GetPlatformMetricsUseCase";
import { InMemoryBusinessCategoryRepo, InMemoryBusinessRepo, InMemoryUserRepo, buildBusiness, buildBusinessCategory, buildUser } from "../../helpers/authFakes";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const CATEGORY_CAFE = "11111111-1111-4111-8111-111111111111";
const CATEGORY_SALON = "22222222-2222-4222-8222-222222222222";
const BUSINESS_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysAgo = (n: number): Date => new Date(todayUTC().getTime() - n * 24 * 60 * 60 * 1000);

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  userRepo?: InMemoryUserRepo;
  turnRepo?: InMemoryTurnRepo;
  categoryRepo?: InMemoryBusinessCategoryRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_A, categoryId: CATEGORY_CAFE, status: "approved" }),
    buildBusiness({ id: BUSINESS_B, categoryId: CATEGORY_SALON, status: "approved" }),
  ]);
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser()]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const categoryRepo = options.categoryRepo ?? new InMemoryBusinessCategoryRepo([
    buildBusinessCategory({ id: CATEGORY_CAFE, name: "Cafetería" }),
    buildBusinessCategory({ id: CATEGORY_SALON, name: "Peluquería" }),
  ]);
  return new GetPlatformMetricsUseCase(businessRepo, userRepo, turnRepo, categoryRepo);
};

describe("GetPlatformMetricsUseCase — conteos generales", () => {
  it("returns total active businesses and total registered users", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, status: "approved" }),
      buildBusiness({ id: BUSINESS_B, status: "pending" }),
    ]);
    const userRepo = new InMemoryUserRepo([buildUser({ id: "u-1" }), buildUser({ id: "u-2" })]);

    const result = await buildUseCase({ businessRepo, userRepo }).execute({});

    expect(result.totalActiveBusinesses).toBe(1);
    expect(result.totalRegisteredUsers).toBe(2);
  });
});

describe("GetPlatformMetricsUseCase — turnos del día y de la semana", () => {
  it("counts all turns created today regardless of status", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC(), status: "completed" }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: todayUTC(), status: "waiting" }),
      buildTurn({ id: "t-3", businessId: BUSINESS_B, turnDate: daysAgo(3), status: "completed" }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({});

    expect(result.turnsToday).toBe(2);
    expect(result.turnsThisWeek).toBe(3);
  });
});

describe("GetPlatformMetricsUseCase — rango de fechas", () => {
  it("recalculates the range metrics when fromDate/toDate are given", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: daysAgo(20), status: "completed" }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: daysAgo(20), status: "cancelled" }),
      buildTurn({ id: "t-3", businessId: BUSINESS_B, turnDate: todayUTC(), status: "completed" }),
    ]);
    const fromDate = daysAgo(21).toISOString().slice(0, 10);
    const toDate = daysAgo(19).toISOString().slice(0, 10);

    const result = await buildUseCase({ turnRepo }).execute({ fromDate, toDate });

    expect(result.range.fromDate).toBe(fromDate);
    expect(result.range.toDate).toBe(toDate);
    expect(result.range.totalTurns).toBe(2);
    expect(result.range.cancelledTurns).toBe(1);
  });

  it("defaults to the last 7 days when no range is given", async () => {
    const result = await buildUseCase().execute({});
    expect(result.range.fromDate).toBe(daysAgo(6).toISOString().slice(0, 10));
    expect(result.range.toDate).toBe(todayUTC().toISOString().slice(0, 10));
  });
});

describe("GetPlatformMetricsUseCase — tasa de cancelación", () => {
  it("computes cancellation rate as completed+cancelled ratio within the range", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC(), status: "completed" }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: todayUTC(), status: "cancelled" }),
      buildTurn({ id: "t-3", businessId: BUSINESS_A, turnDate: todayUTC(), status: "cancelled" }),
      buildTurn({ id: "t-4", businessId: BUSINESS_A, turnDate: todayUTC(), status: "waiting" }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({});

    expect(result.range.cancellationRate).toBeCloseTo(66.7, 1);
  });

  it("returns 0 when there are no completed or cancelled turns in range", async () => {
    const result = await buildUseCase().execute({});
    expect(result.range.cancellationRate).toBe(0);
  });
});

describe("GetPlatformMetricsUseCase — negocios y rubros más activos", () => {
  it("ranks businesses by turn count within the range", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-3", businessId: BUSINESS_B, turnDate: todayUTC() }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({});

    expect(result.range.topBusinesses[0]).toMatchObject({ businessId: BUSINESS_A, businessName: "Cafe Espera", turnCount: 2 });
    expect(result.range.topBusinesses[1]).toMatchObject({ businessId: BUSINESS_B, turnCount: 1 });
  });

  it("aggregates turn counts by category across businesses", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, categoryId: CATEGORY_CAFE, status: "approved" }),
      buildBusiness({ id: BUSINESS_B, categoryId: CATEGORY_CAFE, status: "approved" }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-2", businessId: BUSINESS_B, turnDate: todayUTC() }),
    ]);

    const result = await buildUseCase({ businessRepo, turnRepo }).execute({});

    expect(result.range.topCategories[0]).toMatchObject({ categoryId: CATEGORY_CAFE, categoryName: "Cafetería", turnCount: 2 });
  });
});

describe("GetPlatformMetricsUseCase — errores", () => {
  it("throws BAD_REQUEST for an invalid fromDate format", async () => {
    await expect(
      buildUseCase().execute({ fromDate: "10/03/2026" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
