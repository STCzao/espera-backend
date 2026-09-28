import { describe, expect, it } from "vitest";

import { EnsureQueueCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureQueueCreationAllowedUseCase";
import { ToggleQueueUseCase } from "../../../src/modules/queue/application/ToggleQueueUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, buildQueue } from "../../helpers/queueFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUEUE_ID    = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORG_ID      = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([
    buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
  ]);
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, plan: "premium" }),
  ]);
  const ensureQueueCreationAllowedUseCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);
  return {
    businessRepo, queueRepo, subscriptionRepo,
    useCase: new ToggleQueueUseCase(queueRepo, businessRepo, ensureQueueCreationAllowedUseCase),
  };
};

describe("ToggleQueueUseCase", () => {
  it("deactivates an active queue when another one stays active", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
      buildQueue({ id: "queue-2", businessId: BUSINESS_ID, prefix: "B", isActive: true }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(false);
    expect(queueRepo.all().find((q) => q.id === QUEUE_ID)?.isActive).toBe(false);
  });

  it("activates an inactive queue", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: false }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(true);
  });

  it("updates updatedAt on toggle", async () => {
    const before = new Date();
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: false }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID });

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  describe("última cola activa", () => {
    it("throws 409 when trying to deactivate the business's only active queue", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "QUEUE_LAST_ACTIVE" });
    });

    it("throws 409 when the only other queue is already inactive", async () => {
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
        buildQueue({ id: "queue-2", businessId: BUSINESS_ID, prefix: "B", isActive: false }),
      ]);
      const { useCase } = buildUseCase({ queueRepo });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "QUEUE_LAST_ACTIVE" });
    });

    it("allows deactivating when at least one other queue stays active", async () => {
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
        buildQueue({ id: "queue-2", businessId: BUSINESS_ID, prefix: "B", isActive: true }),
      ]);
      const { useCase } = buildUseCase({ queueRepo });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).resolves.toMatchObject({ isActive: false });
    });

    it("does not block activating a queue, even if it's currently the only one", async () => {
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: false }),
      ]);
      const { useCase } = buildUseCase({ queueRepo });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).resolves.toMatchObject({ isActive: true });
    });
  });

  describe("límite de plan al reactivar", () => {
    it("blocks reactivating a queue that would exceed the plan's maxQueuesPerBusiness", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "basic" }),
      ]);
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: false }),
        buildQueue({ id: "queue-active", businessId: BUSINESS_ID, prefix: "B", isActive: true }),
      ]);
      const { useCase } = buildUseCase({ queueRepo, subscriptionRepo });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });
    });

    it("allows reactivating when it stays within the plan's limit", async () => {
      const { useCase } = buildUseCase({
        queueRepo: new InMemoryQueueRepo([
          buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: false }),
        ]),
      });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).resolves.toMatchObject({ isActive: true });
    });
  });

  describe("errores", () => {
    it("throws 404 when the queue does not exist", async () => {
      const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business behind the queue", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });

    it("throws 400 for an invalid queueId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: "not-a-uuid", ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
