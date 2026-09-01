import { describe, expect, it } from "vitest";

import { ListAllBusinessesUseCase } from "../../../src/modules/business/application/ListAllBusinessesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY_CAFE = "11111111-1111-4111-8111-111111111111";
const CATEGORY_SALON = "22222222-2222-4222-8222-222222222222";

const buildFilterFixture = () => {
  const businessRepo = new InMemoryBusinessRepo([
    buildBusiness({
      id: "business-zeta",
      name: "Zeta Cafe",
      organizationId: ORG_A,
      categoryId: CATEGORY_CAFE,
      status: "approved",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    buildBusiness({
      id: "business-alpha",
      name: "Alpha Salon",
      organizationId: ORG_B,
      categoryId: CATEGORY_SALON,
      status: "suspended",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    }),
  ]);
  const subscriptionRepo = new InMemorySubscriptionRepo([
    buildSubscription({ id: "sub-a", organizationId: ORG_A, plan: "pro", status: "active" }),
    buildSubscription({ id: "sub-b", organizationId: ORG_B, plan: "basic", status: "expired" }),
  ]);
  return { businessRepo, subscriptionRepo };
};

const buildUseCase = (
  businessRepo?: InMemoryBusinessRepo,
  subscriptionRepo?: InMemorySubscriptionRepo,
) => new ListAllBusinessesUseCase(
  businessRepo ?? new InMemoryBusinessRepo([buildBusiness()]),
  subscriptionRepo ?? new InMemorySubscriptionRepo(),
);

describe("ListAllBusinessesUseCase — listado sin filtros", () => {
  it("returns every business regardless of turn activity", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "business-1", status: "approved" }),
      buildBusiness({ id: "business-2", status: "suspended" }),
    ]);

    const result = await buildUseCase(businessRepo).execute({});

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.businessId).sort()).toEqual(["business-1", "business-2"]);
  });
});

describe("ListAllBusinessesUseCase — filtros", () => {
  it("filters by organizationId", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ organizationId: ORG_A });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].businessId).toBe("business-zeta");
  });

  it("filters by categoryId", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ categoryId: CATEGORY_SALON });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].businessId).toBe("business-alpha");
  });

  it("filters by business status, including a business with zero turns", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ status: "suspended" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].businessId).toBe("business-alpha");
  });

  it("filters by subscriptionPlan and subscriptionStatus", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({
      subscriptionPlan: "basic",
      subscriptionStatus: "expired",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].businessId).toBe("business-alpha");
  });
});

describe("ListAllBusinessesUseCase — orden", () => {
  it("sorts by businessName ascending", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({
      sortBy: "businessName",
      sortDir: "asc",
    });
    expect(result.items.map((item) => item.businessName)).toEqual(["Alpha Salon", "Zeta Cafe"]);
  });

  it("sorts by createdAt descending by default", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({});
    expect(result.items.map((item) => item.businessId)).toEqual(["business-alpha", "business-zeta"]);
  });
});

describe("ListAllBusinessesUseCase — paginación", () => {
  it("paginates results", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ page: 1, pageSize: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
    expect(result.total).toBe(2);
  });

  it("returns the second page without repeating the first page's item (no subscription filter, DB-level pagination path)", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const useCase = buildUseCase(businessRepo, subscriptionRepo);

    const page1 = await useCase.execute({ page: 1, pageSize: 1, sortBy: "businessName", sortDir: "asc" });
    const page2 = await useCase.execute({ page: 2, pageSize: 1, sortBy: "businessName", sortDir: "asc" });

    expect(page1.items[0].businessId).toBe("business-alpha");
    expect(page2.items[0].businessId).toBe("business-zeta");
    expect(page2.total).toBe(2);
  });

  it("does not leak a cached subscription across separate execute() calls on the same instance", async () => {
    // ListAllBusinessesUseCase is constructed once and reused for every
    // request — a subscription cache scoped to the instance instead of the
    // call would serve request 2 stale data resolved during request 1.
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "business-1", organizationId: ORG_A, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ id: "sub-a", organizationId: ORG_A, plan: "basic", status: "active" }),
    ]);
    const useCase = buildUseCase(businessRepo, subscriptionRepo);

    const first = await useCase.execute({});
    expect(first.items[0].subscriptionPlan).toBe("basic");

    await subscriptionRepo.save({
      ...(await subscriptionRepo.findByOrganizationId(ORG_A))!,
      plan: "premium",
    });

    const second = await useCase.execute({});
    expect(second.items[0].subscriptionPlan).toBe("premium");
  });
});

describe("ListAllBusinessesUseCase — errores", () => {
  it("throws BAD_REQUEST for an invalid organizationId", async () => {
    await expect(
      buildUseCase().execute({ organizationId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
