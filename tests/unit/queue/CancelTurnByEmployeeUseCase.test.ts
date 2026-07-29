import { describe, expect, it, vi } from "vitest";

import { CancelTurnByEmployeeUseCase } from "../../../src/modules/queue/application/CancelTurnByEmployeeUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter  = options.emitter === undefined ? null : options.emitter;
  return { useCase: new CancelTurnByEmployeeUseCase(turnRepo, emitter as never), turnRepo };
};

describe("CancelTurnByEmployeeUseCase — cancelación exitosa", () => {
  it("cancels a waiting turn without ownership check", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toEqual({ cancelled: true, turnId: TURN_ID });
  });

  it("can also cancel a called turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result.cancelled).toBe(true);
  });

  it("can cancel an attending turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result.cancelled).toBe(true);
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.status).toBe("cancelled");
  });

  it("stamps cancelledAt on the saved turn", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID });

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.status).toBe("cancelled");
    expect(saved?.cancelledAt).toBeInstanceOf(Date);
    expect(saved!.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("can cancel a turn belonging to any customer (no ownership validation)", async () => {
    const OTHER_CUSTOMER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: OTHER_CUSTOMER, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).resolves.toMatchObject({ cancelled: true });
  });

  it("emits queue:update with cancelledTurnId and displayNumber", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-005", status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      cancelledTurnId: TURN_ID,
      cancelledDisplayNumber: "A-005",
    });
  });

  it("works without emitter", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(useCase.execute({ turnId: TURN_ID })).resolves.toMatchObject({ cancelled: true });
  });
});

describe("CancelTurnByEmployeeUseCase — errores", () => {
  it("throws 404 when the turn does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: TURN_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
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
