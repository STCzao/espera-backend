import { describe, expect, it } from "vitest";

import { CreateServiceWindowUseCase } from "../../../src/modules/queue/application/CreateServiceWindowUseCase";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const QUEUE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const queueRepo  = options.queueRepo  ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  return { useCase: new CreateServiceWindowUseCase(queueRepo, windowRepo), windowRepo };
};

describe("CreateServiceWindowUseCase", () => {
  it("creates a window with default type standard", async () => {
    const { useCase, windowRepo } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, name: "Ventanilla 1" });

    expect(result.queueId).toBe(QUEUE_ID);
    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("standard");
    expect(result.isActive).toBe(true);
    expect(result.id).toBeDefined();
    expect(windowRepo.all()).toHaveLength(1);
  });

  it("creates a window with explicit type", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, name: "Preferencial", type: "priority" });

    expect(result.type).toBe("priority");
  });

  it("creates multiple independent windows for the same queue", async () => {
    const { useCase, windowRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, name: "Ventanilla 1" });
    await useCase.execute({ queueId: QUEUE_ID, name: "Ventanilla 2" });

    expect(windowRepo.all()).toHaveLength(2);
    const ids = windowRepo.all().map((w) => w.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("throws 404 when queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(useCase.execute({ queueId: QUEUE_ID, name: "V1" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 for invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ queueId: "not-a-uuid", name: "V1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when name is empty", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ queueId: QUEUE_ID, name: "" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for invalid type", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, name: "V1", type: "invalid" as never }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
