import { describe, expect, it } from "vitest";

import { EnsureQueueCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureQueueCreationAllowedUseCase";
import { CreateQueueUseCase } from "../../../src/modules/queue/application/CreateQueueUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_ID      = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID, status: "approved" }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([
    buildQueue({ id: "queue-existing", businessId: BUSINESS_ID, prefix: "A" }),
  ]);
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, plan: "pro" }),
  ]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const ensureQueueCreationAllowedUseCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);
  return {
    businessRepo, queueRepo, subscriptionRepo, windowRepo,
    useCase: new CreateQueueUseCase(businessRepo, queueRepo, ensureQueueCreationAllowedUseCase, windowRepo),
  };
};

describe("CreateQueueUseCase", () => {
  it("creates a queue for the business, with a default service window", async () => {
    // maxQueuesPerBusiness is 1 across every plan (see PlanLimits.ts) — a
    // business that already has a queue can't get a second one under any
    // plan, so the happy path here starts from zero queues.
    const { useCase, queueRepo, windowRepo } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    const result = await useCase.execute({
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      name: "Caja principal",
      prefix: "a",
    });

    expect(result.businessId).toBe(BUSINESS_ID);
    expect(result.prefix).toBe("A");
    expect(result.isActive).toBe(true);
    expect(queueRepo.all()).toHaveLength(1);

    const windows = await windowRepo.findByQueueId(result.id);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ name: "Ventanilla 1", type: "cashier", isActive: true });
  });

  it("does not count a deactivated queue against the plan's limit", async () => {
    // A queue turned off via ToggleQueueUseCase shouldn't permanently
    // occupy its slot — the business should be able to create a
    // replacement even under Basic (limit 1).
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "basic" }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "queue-old", businessId: BUSINESS_ID, prefix: "A", isActive: false }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo, queueRepo });

    const result = await useCase.execute({
      businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja nueva", prefix: "b",
    });

    expect(result.prefix).toBe("B");
    expect(queueRepo.all()).toHaveLength(2);
  });

  describe("errores", () => {
    it("throws 404 when the business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja 2", prefix: "B" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OTHER_USER_ID, name: "Caja 2", prefix: "B" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });

    it("throws 409 when the business is not operating", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID, status: "suspended" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja 2", prefix: "B" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_NOT_OPERATING" });
    });

    it("throws 403 when the plan's queue limit is reached", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "basic" }),
      ]);
      const { useCase } = buildUseCase({ subscriptionRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja 2", prefix: "B" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });
    });

    it("throws 409 when the prefix is already used by another queue of the same business", async () => {
      // Bypasses the plan gate (a no-op stub) on purpose: with
      // maxQueuesPerBusiness at 1 for every plan, PLAN_QUEUE_LIMIT_REACHED
      // would always fire first on a business that already has a queue —
      // this isolates the prefix-collision check, which still matters for
      // whenever the per-plan limit goes back up.
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID, status: "approved" }),
      ]);
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: "queue-existing", businessId: BUSINESS_ID, prefix: "A" }),
      ]);
      const noOpEnsureQueueCreationAllowed = { execute: async () => undefined } as unknown as EnsureQueueCreationAllowedUseCase;
      const useCase = new CreateQueueUseCase(businessRepo, queueRepo, noOpEnsureQueueCreationAllowed, new InMemoryServiceWindowRepo());

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja 2", prefix: "a" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "QUEUE_PREFIX_ALREADY_IN_USE" });
    });

    it("throws 400 for an invalid prefix", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, name: "Caja 2", prefix: "12" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
