import { describe, expect, it } from "vitest";

import { CreateServiceWindowUseCase } from "../../../src/modules/queue/application/CreateServiceWindowUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const QUEUE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo  = options.queueRepo  ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  return { useCase: new CreateServiceWindowUseCase(queueRepo, windowRepo, businessRepo), windowRepo };
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
