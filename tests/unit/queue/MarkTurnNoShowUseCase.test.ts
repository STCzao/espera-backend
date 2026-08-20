import { describe, expect, it, vi } from "vitest";

import { MarkTurnNoShowUseCase } from "../../../src/modules/queue/application/MarkTurnNoShowUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter  = options.emitter === undefined ? null : options.emitter;
  return { useCase: new MarkTurnNoShowUseCase(turnRepo, emitter as never), turnRepo };
};

describe("MarkTurnNoShowUseCase", () => {
  it("marks a called turn as no_show and stamps noShowAt", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ turnId: TURN_ID, status: "no_show" });
    expect(() => new Date(result.noShowAt)).not.toThrow();
    expect(new Date(result.noShowAt).getTime()).toBeGreaterThanOrEqual(before.getTime());

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.status).toBe("no_show");
    expect(saved?.noShowAt).toBeInstanceOf(Date);
  });

  it("does not touch attendedAt or completedAt-like fields", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID });

    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.attendedAt).toBeUndefined();
  });

  it("emits queue:update with noShowTurnId and displayNumber", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-004", status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      noShowTurnId: TURN_ID,
      noShowDisplayNumber: "A-004",
    });
  });

  it("works without an emitter", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(useCase.execute({ turnId: TURN_ID })).resolves.toMatchObject({ status: "no_show" });
  });

  describe("errores", () => {
    it("throws 404 when the turn does not exist", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
    });

    it("throws 409 when the turn is waiting (never called)", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CALLED" });
    });

    it("throws 409 when the turn is already attending", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CALLED" });
    });

    it("throws 409 when the turn is already completed", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "completed" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CALLED" });
    });

    it("throws 409 when the turn is already no_show", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "no_show" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CALLED" });
    });

    it("throws 400 for an invalid turnId", async () => {
      const { useCase } = buildUseCase();

      await expect(useCase.execute({ turnId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
