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

describe("AttendTurnUseCase — called → attending", () => {
  it("transitions a called turn to attending", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ turnId: TURN_ID, status: "attending" });
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.status).toBe("attending");
  });

  it("stamps startedAttentionAt on the turn", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.startedAttentionAt).toBeInstanceOf(Date);
    expect(saved!.startedAttentionAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.startedAttentionAt).toBeDefined();
    expect(() => new Date(result.startedAttentionAt!)).not.toThrow();
  });

  it("emits queue:update with attendingTurnId and displayNumber", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-003", status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      attendingTurnId: TURN_ID,
      attendingDisplayNumber: "A-003",
    });
  });
});

describe("AttendTurnUseCase — attending → completed", () => {
  it("transitions an attending turn to completed", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ turnId: TURN_ID, status: "completed" });
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.status).toBe("completed");
  });

  it("stamps attendedAt on the turn", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.attendedAt).toBeInstanceOf(Date);
    expect(saved!.attendedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.attendedAt).toBeDefined();
    expect(() => new Date(result.attendedAt!)).not.toThrow();
  });

  it("emits queue:update with attendedTurnId and displayNumber", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-003", status: "attending" }),
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
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(useCase.execute({ turnId: TURN_ID })).resolves.toMatchObject({ status: "completed" });
  });
});

describe("AttendTurnUseCase — serviceWindowId", () => {
  const WINDOW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("assigns serviceWindowId on called → attending transition", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID, serviceWindowId: WINDOW_ID });

    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.serviceWindowId).toBe(WINDOW_ID);
  });

  it("keeps existing serviceWindowId on attending → completed when none provided", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID });

    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.serviceWindowId).toBe(WINDOW_ID);
  });
});

describe("AttendTurnUseCase — ocupación de ventanilla", () => {
  const WINDOW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("throws 409 when assigning a window already attending another turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
      buildTurn({ id: "other-turn", queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, serviceWindowId: WINDOW_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_WINDOW_OCCUPIED" });
  });

  it("allows assigning a window that is free", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, serviceWindowId: WINDOW_ID }),
    ).resolves.toMatchObject({ status: "attending" });
  });

  it("does not conflict with itself when re-attending the same window it already occupies", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "redirected", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).resolves.toMatchObject({ status: "attending" });
  });
});

describe("AttendTurnUseCase — redirected → attending", () => {
  const WINDOW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("transitions a redirected turn to attending at the suggested window", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "redirected", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result.status).toBe("attending");
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.serviceWindowId).toBe(WINDOW_ID);
  });

  it("preserves the original startedAttentionAt when resuming from a redirect", async () => {
    const originalStart = new Date("2026-01-01T10:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "redirected", serviceWindowId: WINDOW_ID, startedAttentionAt: originalStart }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result.startedAttentionAt).toBe(originalStart.toISOString());
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.startedAttentionAt).toEqual(originalStart);
  });
});

describe("AttendTurnUseCase — errores", () => {
  it("throws 404 when the turn does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
  });

  it("throws 409 when the turn is waiting", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });

  it("throws 409 when the turn is already completed", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "completed" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });

  it("throws 409 when the turn is cancelled", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "cancelled" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });

  it("throws 400 for an invalid turnId", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ turnId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
