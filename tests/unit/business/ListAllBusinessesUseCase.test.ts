import { describe, expect, it, vi } from "vitest";

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
  const subscriptions = [
    buildSubscription({ id: "sub-a", organizationId: ORG_A, plan: "pro", status: "active" }),
    buildSubscription({ id: "sub-b", organizationId: ORG_B, plan: "basic", status: "expired" }),
  ];
  const subscriptionRepo = new InMemorySubscriptionRepo(subscriptions);
  // The subscription-shaped filters are resolved by the business repo now
  // (through the Organization relation in Postgres), so the fake needs the
  // same data the subscription repo holds — seeded from one list so the two
  // can't drift apart.
  for (const subscription of subscriptions) {
    businessRepo.subscriptionsByOrgId.set(subscription.organizationId, {
      plan: subscription.plan,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
    });
  }
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

  it("filters by commercialState", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({
      commercialState: "expired",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].businessId).toBe("business-alpha");
  });
});

describe("ListAllBusinessesUseCase — commercialState", () => {
  it("derives paying_<plan> for an active subscription and exposes it alongside plan/status", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ organizationId: ORG_A });
    expect(result.items[0]).toMatchObject({
      subscriptionPlan: "pro",
      subscriptionStatus: "active",
      commercialState: "paying_pro",
    });
  });

  it("derives trialing_<plan> for a trial subscription", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "business-1", organizationId: ORG_A }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_A, plan: "premium", status: "trial" }),
    ]);
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({});
    expect(result.items[0].commercialState).toBe("trialing_premium");
  });

  it("derives expired regardless of the underlying plan", async () => {
    const { businessRepo, subscriptionRepo } = buildFilterFixture();
    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({ organizationId: ORG_B });
    expect(result.items[0]).toMatchObject({ subscriptionPlan: "basic", commercialState: "expired" });
  });

  it("leaves commercialState undefined when the organization has no Subscription", async () => {
    const businessRepo = new InMemoryBusinessRepo([buildBusiness({ id: "business-1" })]);
    const result = await buildUseCase(businessRepo, new InMemorySubscriptionRepo()).execute({});
    expect(result.items[0].commercialState).toBeUndefined();
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

describe("ListAllBusinessesUseCase — el filtro de suscripción se resuelve en la base", () => {
  const seed = (subscription: { plan: "basic" | "pro" | "premium"; status: "pending" | "trial" | "active" | "expired" | "cancelled"; trialEndsAt?: Date | null }, count: number) => {
    const businessRepo = new InMemoryBusinessRepo(
      Array.from({ length: count }, (_, i) =>
        buildBusiness({
          id: `business-${i}`,
          name: `Business ${String(i).padStart(2, "0")}`,
          organizationId: ORG_A,
          createdAt: new Date(2026, 0, i + 1),
        }),
      ),
    );
    businessRepo.subscriptionsByOrgId.set(ORG_A, subscription);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ id: "sub-a", organizationId: ORG_A, ...subscription }),
    ]);
    return { businessRepo, subscriptionRepo };
  };

  it("asks the repo for one page only, instead of reading every match to slice in memory", async () => {
    const { businessRepo, subscriptionRepo } = seed({ plan: "pro", status: "active" }, 30);
    const findMany = vi.spyOn(businessRepo, "findMany");

    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({
      commercialState: "paying_pro",
      page: 2,
      pageSize: 10,
    });

    expect(result.items).toHaveLength(10);
    expect(result.total).toBe(30);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        subscription: { plan: "pro", effectiveStatus: "active" },
      }),
    );
  });

  it("decomposes every commercialState into a plan + effective status the repo can query", async () => {
    const { businessRepo, subscriptionRepo } = seed({ plan: "basic", status: "active" }, 1);
    const findMany = vi.spyOn(businessRepo, "findMany");
    const useCase = buildUseCase(businessRepo, subscriptionRepo);

    const cases = [
      ["pending_approval", { plan: undefined, effectiveStatus: "pending" }],
      ["trialing_premium", { plan: "premium", effectiveStatus: "trial" }],
      ["paying_basic", { plan: "basic", effectiveStatus: "active" }],
      ["cancelled", { plan: undefined, effectiveStatus: "cancelled" }],
    ] as const;

    for (const [commercialState, expected] of cases) {
      findMany.mockClear();
      await useCase.execute({ commercialState });
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ subscription: expected }));
    }
  });

  it("does not filter on subscription at all when no subscription param is given", async () => {
    const { businessRepo, subscriptionRepo } = seed({ plan: "pro", status: "active" }, 1);
    const findMany = vi.spyOn(businessRepo, "findMany");

    await buildUseCase(businessRepo, subscriptionRepo).execute({ status: "approved" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ subscription: undefined }));
  });

  it("counts a lapsed trial as expired, without waiting for anything to rewrite its status", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { businessRepo, subscriptionRepo } = seed(
      { plan: "pro", status: "trial", trialEndsAt: yesterday },
      1,
    );
    const useCase = buildUseCase(businessRepo, subscriptionRepo);

    await expect(useCase.execute({ commercialState: "expired" })).resolves.toMatchObject({ total: 1 });
    await expect(useCase.execute({ commercialState: "trialing_pro" })).resolves.toMatchObject({ total: 0 });
  });

  it("still finds a trial that has not lapsed yet", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { businessRepo, subscriptionRepo } = seed(
      { plan: "pro", status: "trial", trialEndsAt: tomorrow },
      1,
    );
    const useCase = buildUseCase(businessRepo, subscriptionRepo);

    await expect(useCase.execute({ commercialState: "trialing_pro" })).resolves.toMatchObject({ total: 1 });
    await expect(useCase.execute({ commercialState: "expired" })).resolves.toMatchObject({ total: 0 });
  });

  it("matches nothing when commercialState and the individual params contradict each other", async () => {
    const { businessRepo, subscriptionRepo } = seed({ plan: "pro", status: "active" }, 1);

    const result = await buildUseCase(businessRepo, subscriptionRepo).execute({
      commercialState: "paying_pro",
      subscriptionPlan: "basic",
    });

    expect(result.total).toBe(0);
  });
});
