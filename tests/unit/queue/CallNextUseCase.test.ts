import { describe, expect, it, vi } from "vitest";

import { CallNextUseCase } from "../../../src/modules/queue/application/CallNextUseCase";
import {
  InMemoryQueueRepo,
  InMemoryTurnRepo,
  buildQueue,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const queueRepo =
    options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, isActive: true })]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter = options.emitter === undefined ? null : options.emitter;
  return {
    queueRepo,
    turnRepo,
    useCase: new CallNextUseCase(queueRepo, turnRepo, emitter as never),
  };
};

describe("CallNextUseCase", () => {
  it("marks the next waiting turn as called and returns it", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result).toMatchObject({ queueId: QUEUE_ID, displayNumber: "A-001" });
    expect(turnRepo.all().find((t) => t.id === "t-1")?.status).toBe("called");
  });

  it("completes the currently-called turn before calling the next", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, status: "called" }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ queueId: QUEUE_ID });

    expect(turnRepo.all().find((t) => t.id === "t-1")?.status).toBe("completed");
    expect(turnRepo.all().find((t) => t.id === "t-2")?.status).toBe("called");
  });

  it("selects the highest-priority waiting turn first", async () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, priority: "registered", createdAt: new Date(base.getTime()) }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, displayNumber: "A-002", priority: "arrived", createdAt: new Date(base.getTime() + 1000) }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.displayNumber).toBe("A-002");
  });

  it("resolves FIFO when two turns have the same priority", async () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, number: 1, priority: "registered", createdAt: new Date(base.getTime()) }),
      buildTurn({ id: "t-2", queueId: QUEUE_ID, number: 2, displayNumber: "A-002", priority: "registered", createdAt: new Date(base.getTime() + 1000) }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(result.displayNumber).toBe("A-001");
  });

  it("emits queue:update after calling a turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const emitter = { emitQueueUpdate: vi.fn() };
    const { useCase } = buildUseCase({ turnRepo, emitter });

    const result = await useCase.execute({ queueId: QUEUE_ID });

    expect(emitter.emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitter.emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      calledTurnId: result.turnId,
      calledDisplayNumber: result.displayNumber,
    });
  });

  it("does not throw if no emitter is provided", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(useCase.execute({ queueId: QUEUE_ID })).resolves.toBeDefined();
  });

  it("throws CONFLICT when the queue is empty", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws NOT_FOUND when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws CONFLICT when the queue is inactive", async () => {
    const { useCase } = buildUseCase({
      queueRepo: new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, isActive: false })]),
    });

    await expect(
      useCase.execute({ queueId: QUEUE_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws BAD_REQUEST for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
