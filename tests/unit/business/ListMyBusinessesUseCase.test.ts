import { describe, expect, it } from "vitest";

import { ListMyBusinessesUseCase } from "../../../src/modules/business/application/ListMyBusinessesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "organization-1";

const buildUseCase = (options: {
  businesses?: ReturnType<typeof buildBusiness>[];
  subscription?: ReturnType<typeof buildSubscription>;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const businessRepo = new InMemoryBusinessRepo(options.businesses ?? []);
  const subscriptionRepo = new InMemorySubscriptionRepo(
    options.subscription ? [options.subscription] : [buildSubscription({ organizationId: ORG_ID })],
  );
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  return new ListMyBusinessesUseCase(businessRepo, subscriptionRepo, queueRepo, windowRepo);
};

describe("ListMyBusinessesUseCase", () => {
  it("returns businesses belonging to the owner", async () => {
    const useCase = buildUseCase({
      businesses: [
        buildBusiness({ id: "biz-1", slug: "cafe-espera", ownerUserId: OWNER_ID, status: "approved", organizationId: ORG_ID }),
        buildBusiness({ id: "biz-2", slug: "bar-espera", ownerUserId: OWNER_ID, status: "pending", organizationId: ORG_ID }),
      ],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses).toHaveLength(2);
    expect(result.businesses[0]).toMatchObject({ slug: "cafe-espera", status: "approved" });
    expect(result.businesses[1]).toMatchObject({ slug: "bar-espera", status: "pending" });
  });

  it("does not expose organizationId", async () => {
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });
    const business = result.businesses[0] as Record<string, unknown>;

    expect(business).not.toHaveProperty("organizationId");
    expect(business).toHaveProperty("id");
  });

  it("includes profile fields needed to preload the edit form", async () => {
    const useCase = buildUseCase({
      businesses: [
        buildBusiness({
          ownerUserId: OWNER_ID,
          organizationId: ORG_ID,
          categoryId: "11111111-1111-4111-8111-111111111111",
          address: "Av. Corrientes 1234, CABA",
          latitude: -34.6037,
          longitude: -58.3816,
        }),
      ],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });
    const business = result.businesses[0];

    expect(business).toMatchObject({
      categoryId: "11111111-1111-4111-8111-111111111111",
      address: "Av. Corrientes 1234, CABA",
      latitude: -34.6037,
      longitude: -58.3816,
    });
    expect(business).not.toHaveProperty("organizationId");
  });

  it("exposes subscription plan and status for each business", async () => {
    const trialEndsAt = new Date("2026-08-10T00:00:00.000Z");
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
      subscription: buildSubscription({
        organizationId: ORG_ID,
        plan: "pro",
        status: "trial",
        trialEndsAt,
      }),
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });
    const business = result.businesses[0];

    expect(business).toMatchObject({
      plan: "pro",
      subscriptionStatus: "trial",
      trialEndsAt: trialEndsAt.toISOString(),
    });
  });

  it("returns trialEndsAt as null when subscription has no trial", async () => {
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
      subscription: buildSubscription({ organizationId: ORG_ID, plan: "basic", status: "active", trialEndsAt: null }),
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].trialEndsAt).toBeNull();
  });

  it("falls back to basic/pending when no subscription is found", async () => {
    const useCase = new ListMyBusinessesUseCase(
      new InMemoryBusinessRepo([buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })]),
      new InMemorySubscriptionRepo([]),
      new InMemoryQueueRepo(),
      new InMemoryServiceWindowRepo(),
    );

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0]).toMatchObject({ plan: "basic", subscriptionStatus: "pending" });
  });

  it("exposes activeQueueId when a queue exists for the business", async () => {
    const BIZ_ID = "biz-uuid-1111-1111-1111-111111111111";
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BIZ_ID, isActive: true }),
    ]);
    const useCase = buildUseCase({
      businesses: [buildBusiness({ id: BIZ_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID })],
      queueRepo,
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].activeQueueId).toBe("q-1");
  });

  it("returns activeQueueId as null when no queue exists", async () => {
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].activeQueueId).toBeNull();
  });

  it("returns empty array when owner has no businesses", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses).toHaveLength(0);
  });
});
