import { describe, expect, it, vi } from "vitest";

import { ListMyBusinessesUseCase } from "../../../src/modules/business/application/ListMyBusinessesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryOrganizationRepo, InMemorySubscriptionRepo, buildOrganization, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue, buildServiceWindow } from "../../helpers/queueFakes";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "organization-1";

const buildUseCase = (options: {
  businesses?: ReturnType<typeof buildBusiness>[];
  subscription?: ReturnType<typeof buildSubscription>;
  organization?: ReturnType<typeof buildOrganization> | null;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const businessRepo = new InMemoryBusinessRepo(options.businesses ?? []);
  const subscriptionRepo = new InMemorySubscriptionRepo(
    options.subscription ? [options.subscription] : [buildSubscription({ organizationId: ORG_ID })],
  );
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const organization = options.organization === null ? null : (options.organization ?? buildOrganization({ id: ORG_ID }));
  const organizationRepo = new InMemoryOrganizationRepo(organization ? [organization] : []);
  return new ListMyBusinessesUseCase(businessRepo, subscriptionRepo, queueRepo, windowRepo, organizationRepo);
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

  it("exposes organizationId per business, needed to call PATCH /organizations/:organizationId", async () => {
    // Used to be withheld on purpose; the panel now needs it to let an
    // owner edit their Organization's name/legalId (no endpoint can do that
    // without it, and GET /business/me was the only place this account's
    // owner could learn it from).
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0]).toMatchObject({ organizationId: ORG_ID });
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
      new InMemoryOrganizationRepo([buildOrganization({ id: ORG_ID })]),
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

  it("exposes every queue for the business, not just the active one", async () => {
    const BIZ_ID = "biz-uuid-2222-2222-2222-222222222222";
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BIZ_ID, name: "Caja principal", prefix: "A", isActive: true }),
      buildQueue({ id: "q-2", businessId: BIZ_ID, name: "Turnos VIP", prefix: "B", isActive: false }),
    ]);
    const useCase = buildUseCase({
      businesses: [buildBusiness({ id: BIZ_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID })],
      queueRepo,
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].queues).toHaveLength(2);
    expect(result.businesses[0].queues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "q-1", name: "Caja principal", prefix: "A", isActive: true }),
        expect.objectContaining({ id: "q-2", name: "Turnos VIP", prefix: "B", isActive: false }),
      ]),
    );
  });

  it("returns activeServiceWindows per queue inside the queues array", async () => {
    const BIZ_ID = "biz-uuid-3333-3333-3333-333333333333";
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BIZ_ID, prefix: "A", isActive: true }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: "q-1", isActive: true }),
      buildServiceWindow({ id: "w-2", queueId: "q-1", isActive: false }),
    ]);
    const useCase = buildUseCase({
      businesses: [buildBusiness({ id: BIZ_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID })],
      queueRepo,
      windowRepo,
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].queues[0]).toMatchObject({ id: "q-1", activeServiceWindows: 1 });
  });

  it("returns an empty queues array when the business has no queues", async () => {
    const useCase = buildUseCase({
      businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
    });

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses[0].queues).toEqual([]);
  });

  it("returns empty array when owner has no businesses", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses).toHaveLength(0);
  });

  describe("organization", () => {
    it("exposes id, name, legalId and status — the panel's edit form needs all four", async () => {
      const useCase = buildUseCase({
        businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
        organization: buildOrganization({ id: ORG_ID, name: "Café Espera SRL", legalId: "30-12345678-9", status: "approved" }),
      });

      const result = await useCase.execute({ ownerUserId: OWNER_ID });

      expect(result.organization).toEqual({
        id: ORG_ID,
        name: "Café Espera SRL",
        legalId: "30-12345678-9",
        status: "approved",
      });
    });

    it("returns legalId as null instead of undefined when the Organization predates it being mandatory", async () => {
      const useCase = buildUseCase({
        businesses: [buildBusiness({ ownerUserId: OWNER_ID, organizationId: ORG_ID })],
        organization: buildOrganization({ id: ORG_ID, legalId: undefined }),
      });

      const result = await useCase.execute({ ownerUserId: OWNER_ID });

      expect(result.organization?.legalId).toBeNull();
    });

    it("is null when the owner has no Business yet (no Organization exists until the first one is created)", async () => {
      const useCase = buildUseCase({ businesses: [] });

      const result = await useCase.execute({ ownerUserId: OWNER_ID });

      expect(result.organization).toBeNull();
    });

    it("is read once, not once per business, since every Business shares the one account-level Organization", async () => {
      const organization = buildOrganization({ id: ORG_ID, name: "Café Espera SRL" });
      const organizationRepo = new InMemoryOrganizationRepo([organization]);
      const findByIdSpy = vi.spyOn(organizationRepo, "findById");
      const useCase = new ListMyBusinessesUseCase(
        new InMemoryBusinessRepo([
          buildBusiness({ id: "biz-1", ownerUserId: OWNER_ID, organizationId: ORG_ID }),
          buildBusiness({ id: "biz-2", ownerUserId: OWNER_ID, organizationId: ORG_ID }),
        ]),
        new InMemorySubscriptionRepo([buildSubscription({ organizationId: ORG_ID })]),
        new InMemoryQueueRepo(),
        new InMemoryServiceWindowRepo(),
        organizationRepo,
      );

      const result = await useCase.execute({ ownerUserId: OWNER_ID });

      expect(findByIdSpy).toHaveBeenCalledTimes(1);
      expect(result.organization?.name).toBe("Café Espera SRL");
    });
  });
});
