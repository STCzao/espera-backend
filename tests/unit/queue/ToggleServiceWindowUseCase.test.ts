import { describe, expect, it } from "vitest";

import { EnsureServiceWindowCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureServiceWindowCreationAllowedUseCase";
import { ToggleServiceWindowUseCase } from "../../../src/modules/queue/application/ToggleServiceWindowUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, InMemoryTurnRepo, buildQueue, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const WINDOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "queue-1";
const BUSINESS_ID = "business-1";
const ORG_ID = "organization-1";
const OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  windowRepo?: InMemoryServiceWindowRepo;
  turnRepo?: InMemoryTurnRepo;
  queueRepo?: InMemoryQueueRepo;
  businessRepo?: InMemoryBusinessRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
} = {}) => {
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, organizationId: ORG_ID }),
  ]);
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, plan: "premium" }),
  ]);
  const ensureServiceWindowCreationAllowedUseCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);
  return {
    useCase: new ToggleServiceWindowUseCase(windowRepo, turnRepo, queueRepo, businessRepo, ensureServiceWindowCreationAllowedUseCase),
    windowRepo, turnRepo,
  };
};

describe("ToggleServiceWindowUseCase", () => {
  it("deactivates an active window", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(false);
    expect(windowRepo.all()[0].isActive).toBe(false);
  });

  it("activates an inactive window", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: false }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(true);
    expect(windowRepo.all()[0].isActive).toBe(true);
  });

  it("updates updatedAt on toggle", async () => {
    const before = new Date();
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("does not modify other fields", async () => {
    const original = buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "customer_service", isActive: true });
    const windowRepo = new InMemoryServiceWindowRepo([original]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("customer_service");
    expect(result.queueId).toBe(original.queueId);
  });

  describe("errores", () => {
    it("throws 404 when window does not exist", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business behind the window's queue", async () => {
      const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
      const { useCase } = buildUseCase({ windowRepo });

      await expect(
        useCase.execute({ windowId: WINDOW_ID, ownerUserId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });

    it("throws 400 for invalid windowId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ windowId: "not-a-uuid", ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});

describe("ToggleServiceWindowUseCase — límite de plan al reactivar", () => {
  it("blocks reactivating a window that would exceed the plan's maxServiceWindowsPerQueue", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "basic" }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, queueId: QUEUE_ID, isActive: false }),
      buildServiceWindow({ id: "window-active", queueId: QUEUE_ID, isActive: true }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, subscriptionRepo });

    await expect(
      useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
  });

  it("allows reactivating when it stays within the plan's limit", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "basic" }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, queueId: QUEUE_ID, isActive: false }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, subscriptionRepo });

    await expect(
      useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
    ).resolves.toMatchObject({ isActive: true });
  });
});

describe("ToggleServiceWindowUseCase — ocupación", () => {
  it("throws 409 when trying to deactivate a window currently attending a turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    await expect(useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_WINDOW_IN_USE",
    });
  });

  it("throws 409 when trying to deactivate a window with a turn redirected to it but not yet attending", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "redirected", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    await expect(useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_WINDOW_IN_USE",
    });
  });

  it("allows deactivating a window with no attending turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "called", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(false);
  });

  it("allows reactivating a window even if it would (hypothetically) be occupied", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: false }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result.isActive).toBe(true);
  });
});
