import { describe, expect, it } from "vitest";

import { CreateServiceWindowUseCase } from "../../../src/modules/queue/application/CreateServiceWindowUseCase";
import { EnsureServiceWindowCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureServiceWindowCreationAllowedUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const QUEUE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORGANIZATION_ID = "organization-1";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
  businessRepo?: InMemoryBusinessRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
} = {}) => {
  const queueRepo  = options.queueRepo  ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORGANIZATION_ID }),
  ]);
  // Default plan is premium (generous cap) so tests unrelated to plan
  // limits don't need to think about them; the limit itself is covered
  // separately below.
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORGANIZATION_ID, plan: "premium" }),
  ]);
  const ensureServiceWindowCreationAllowedUseCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);
  return {
    useCase: new CreateServiceWindowUseCase(queueRepo, windowRepo, businessRepo, ensureServiceWindowCreationAllowedUseCase),
    windowRepo,
  };
};

describe("CreateServiceWindowUseCase", () => {
  it("creates a window with default type cashier", async () => {
    const { useCase, windowRepo } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 1" });

    expect(result.queueId).toBe(QUEUE_ID);
    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("cashier");
    expect(result.isActive).toBe(true);
    expect(result.id).toBeDefined();
    expect(windowRepo.all()).toHaveLength(1);
  });

  it("creates a window with explicit type", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Soporte", type: "technical" });

    expect(result.type).toBe("technical");
  });

  it("creates multiple independent windows for the same queue", async () => {
    const { useCase, windowRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 1" });
    await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 2" });

    expect(windowRepo.all()).toHaveLength(2);
    const ids = windowRepo.all().map((w) => w.id);
    expect(new Set(ids).size).toBe(2);
  });

  describe("límite por plan", () => {
    it("rejects a second window under a BASIC plan", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "basic" }),
      ]);
      const { useCase } = buildUseCase({ subscriptionRepo });

      await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 1" });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 2" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
    });

    it("does not count a deactivated window against the plan's limit", async () => {
      // A window turned off via ToggleServiceWindowUseCase shouldn't
      // permanently occupy its slot — a replacement should still fit even
      // under Basic (limit 1).
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "basic" }),
      ]);
      const windowRepo = new InMemoryServiceWindowRepo([
        { id: "window-old", queueId: QUEUE_ID, name: "Vieja", type: "cashier", isActive: false, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const { useCase } = buildUseCase({ subscriptionRepo, windowRepo });

      const result = await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla nueva" });

      expect(result.isActive).toBe(true);
      expect(windowRepo.all()).toHaveLength(2);
    });

    it("allows up to 10 windows under a PRO plan, rejects the 11th", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "pro" }),
      ]);
      const { useCase, windowRepo } = buildUseCase({ subscriptionRepo });

      for (let i = 1; i <= 10; i += 1) {
        await useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: `Ventanilla ${i}` });
      }
      expect(windowRepo.all()).toHaveLength(10);

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "Ventanilla 11" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
    });
  });

  describe("errores", () => {
    it("throws 404 when queue does not exist", async () => {
      const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "V1" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business behind the queue", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OTHER_USER_ID, name: "V1" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });

    it("throws 400 for invalid queueId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: "not-a-uuid", ownerUserId: OWNER_ID, name: "V1" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 when name is empty", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for invalid type", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ queueId: QUEUE_ID, ownerUserId: OWNER_ID, name: "V1", type: "invalid" as never }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
