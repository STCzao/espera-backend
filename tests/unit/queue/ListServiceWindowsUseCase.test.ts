import { describe, expect, it } from "vitest";

import { ListServiceWindowsUseCase } from "../../../src/modules/queue/application/ListServiceWindowsUseCase";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue, buildServiceWindow } from "../../helpers/queueFakes";

const QUEUE_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const queueRepo  = options.queueRepo  ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  return { useCase: new ListServiceWindowsUseCase(queueRepo, windowRepo), windowRepo };
};

describe("ListServiceWindowsUseCase", () => {
  it("returns all windows for the queue ordered by createdAt", async () => {
    const w1 = buildServiceWindow({ id: "w-1", queueId: QUEUE_ID, name: "Ventanilla 1", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") });
    const w2 = buildServiceWindow({ id: "w-2", queueId: QUEUE_ID, name: "Ventanilla 2", createdAt: new Date("2026-01-02T00:00:00Z"), updatedAt: new Date("2026-01-02T00:00:00Z") });
    const { useCase } = buildUseCase({ windowRepo: new InMemoryServiceWindowRepo([w2, w1]) });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].name).toBe("Ventanilla 1");
    expect(result.windows[1].name).toBe("Ventanilla 2");
  });

  it("returns empty array when queue has no windows", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.windows).toHaveLength(0);
  });

  it("does not return windows from other queues", async () => {
    const w = buildServiceWindow({ id: "w-1", queueId: QUEUE_ID2 });
    const { useCase } = buildUseCase({ windowRepo: new InMemoryServiceWindowRepo([w]) });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.windows).toHaveLength(0);
  });

  it("throws 404 when queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(useCase.execute({ queueId: QUEUE_ID })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ queueId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
