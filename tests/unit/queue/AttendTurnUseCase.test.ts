import { describe, expect, it, vi } from "vitest";

import { AttendTurnUseCase } from "../../../src/modules/queue/application/AttendTurnUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter  = options.emitter === undefined ? null : options.emitter;
  return { useCase: new AttendTurnUseCase(turnRepo, emitter as never), turnRepo };
};

describe("AttendTurnUseCase — atención exitosa", () => {
  it("marks a called turn as completed", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ attended: true, turnId: TURN_ID });
  });

  it("stamps attendedAt on the saved turn", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID });

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.status).toBe("completed");
    expect(saved?.attendedAt).toBeInstanceOf(Date);
    expect(saved!.attendedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("returns attendedAt as ISO string", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(typeof result.attendedAt).toBe("string");
    expect(() => new Date(result.attendedAt)).not.toThrow();
  });

  it("emits queue:update with attendedTurnId and displayNumber", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-003", status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      attendedTurnId: TURN_ID,
      attendedDisplayNumber: "A-003",
    });
  });

  it("works without emitter", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(useCase.execute({ turnId: TURN_ID })).resolves.toMatchObject({ attended: true });
  });
});

describe("AttendTurnUseCase — errores", () => {
  it("throws 404 when the turn does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 409 when the turn is waiting (not yet called)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when the turn is already completed", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "completed" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when the turn is already cancelled", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "cancelled" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 400 for an invalid turnId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
