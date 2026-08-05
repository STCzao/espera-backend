import { describe, expect, it } from "vitest";

import { GetPlatformMetricsUseCase } from "../../../src/modules/business/application/GetPlatformMetricsUseCase";
import { InMemoryBusinessCategoryRepo, InMemoryBusinessRepo, InMemoryUserRepo, buildBusiness, buildBusinessCategory, buildUser } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
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
  subscriptionRepo?: InMemorySubscriptionRepo;
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
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo();
  return new GetPlatformMetricsUseCase(businessRepo, userRepo, turnRepo, categoryRepo, subscriptionRepo);
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
  it("ranks businesses by turn count within the range by default", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-3", businessId: BUSINESS_B, turnDate: todayUTC() }),
    ]);

    const result = await buildUseCase({ turnRepo }).execute({});

    expect(result.range.businesses.items[0]).toMatchObject({ businessId: BUSINESS_A, businessName: "Cafe Espera", turnCount: 2 });
    expect(result.range.businesses.items[1]).toMatchObject({ businessId: BUSINESS_B, turnCount: 1 });
    expect(result.range.businesses.total).toBe(2);
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

describe("GetPlatformMetricsUseCase — filtros, orden y paginación de negocios", () => {
  const ORG_A = "33333333-3333-4333-8333-333333333333";
  const ORG_B = "44444444-4444-4444-8444-444444444444";

  const buildFilterFixture = () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, categoryId: CATEGORY_CAFE, status: "approved", organizationId: ORG_A, name: "Zeta Cafe" }),
      buildBusiness({ id: BUSINESS_B, categoryId: CATEGORY_SALON, status: "suspended", organizationId: ORG_B, name: "Alpha Salon" }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-2", businessId: BUSINESS_A, turnDate: todayUTC() }),
      buildTurn({ id: "t-3", businessId: BUSINESS_B, turnDate: todayUTC() }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ id: "sub-a", organizationId: ORG_A, plan: "premium", status: "active" }),
      buildSubscription({ id: "sub-b", organizationId: ORG_B, plan: "basic", status: "trial" }),
    ]);
    return { businessRepo, turnRepo, subscriptionRepo };
  };

  it("filters by organizationId", async () => {
    const { businessRepo, turnRepo, subscriptionRepo } = buildFilterFixture();

    const result = await buildUseCase({ businessRepo, turnRepo, subscriptionRepo }).execute({ organizationId: ORG_A });

    expect(result.range.businesses.items).toHaveLength(1);
    expect(result.range.businesses.items[0].businessId).toBe(BUSINESS_A);
  });

  it("filters by business status", async () => {
    const { businessRepo, turnRepo, subscriptionRepo } = buildFilterFixture();

    const result = await buildUseCase({ businessRepo, turnRepo, subscriptionRepo }).execute({ status: "suspended" });

    expect(result.range.businesses.items).toHaveLength(1);
    expect(result.range.businesses.items[0].businessId).toBe(BUSINESS_B);
  });

  it("filters by subscriptionPlan and subscriptionStatus", async () => {
    const { businessRepo, turnRepo, subscriptionRepo } = buildFilterFixture();

    const result = await buildUseCase({ businessRepo, turnRepo, subscriptionRepo }).execute({ subscriptionPlan: "premium" });

    expect(result.range.businesses.items).toHaveLength(1);
    expect(result.range.businesses.items[0]).toMatchObject({ businessId: BUSINESS_A, subscriptionPlan: "premium", subscriptionStatus: "active" });
  });

  it("sorts by businessName ascending", async () => {
    const { businessRepo, turnRepo, subscriptionRepo } = buildFilterFixture();

    const result = await buildUseCase({ businessRepo, turnRepo, subscriptionRepo }).execute({
      sortBy: "businessName",
      sortDir: "asc",
    });

    expect(result.range.businesses.items.map((b) => b.businessId)).toEqual([BUSINESS_B, BUSINESS_A]);
  });

  it("paginates results", async () => {
    const { businessRepo, turnRepo, subscriptionRepo } = buildFilterFixture();

    const result = await buildUseCase({ businessRepo, turnRepo, subscriptionRepo }).execute({ page: 2, pageSize: 1 });

    expect(result.range.businesses.items).toHaveLength(1);
    expect(result.range.businesses.page).toBe(2);
    expect(result.range.businesses.pageSize).toBe(1);
    expect(result.range.businesses.total).toBe(2);
    expect(result.range.businesses.items[0].businessId).toBe(BUSINESS_B);
  });
});

describe("GetPlatformMetricsUseCase — errores", () => {
  it("throws BAD_REQUEST for an invalid fromDate format", async () => {
    await expect(
      buildUseCase().execute({ fromDate: "10/03/2026" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
