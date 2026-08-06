import { describe, expect, it } from "vitest";

import { EnsureQueueCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureQueueCreationAllowedUseCase";
import { CreateQueueUseCase } from "../../../src/modules/queue/application/CreateQueueUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, buildQueue } from "../../helpers/queueFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORG_ID      = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
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
  const ensureQueueCreationAllowedUseCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);
  return {
    businessRepo, queueRepo, subscriptionRepo,
    useCase: new CreateQueueUseCase(businessRepo, queueRepo, ensureQueueCreationAllowedUseCase),
  };
};

describe("CreateQueueUseCase", () => {
  it("creates an additional queue for the business", async () => {
    const { useCase, queueRepo } = buildUseCase();

    const result = await useCase.execute({
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      name: "Caja 2",
      prefix: "b",
    });

    expect(result.businessId).toBe(BUSINESS_ID);
    expect(result.prefix).toBe("B");
    expect(result.isActive).toBe(true);
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
      const { useCase } = buildUseCase();

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
