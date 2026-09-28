import { describe, expect, it, vi } from "vitest";

import { CancelTurnUseCase } from "../../../src/modules/queue/application/CancelTurnUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CUSTOMER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter = options.emitter === undefined ? null : options.emitter;
  const useCase = new CancelTurnUseCase(turnRepo, emitter as never);
  return { useCase, turnRepo };
};

describe("CancelTurnUseCase — cancelación exitosa", () => {
  it("cancels a waiting turn and returns confirmed output", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID });

    expect(result).toEqual({ cancelled: true, turnId: TURN_ID });
  });

  it("sets status to cancelled and stamps cancelledAt", async () => {
    const before = new Date();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID });

    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.status).toBe("cancelled");
    expect(saved?.cancelledAt).toBeInstanceOf(Date);
    expect(saved!.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("can also cancel a called turn (customer was next but decides to leave)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "called" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID });

    expect(result.cancelled).toBe(true);
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.status).toBe("cancelled");
  });

  it("emits queue:update so other customers' positions refresh", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: TURN_ID,
        queueId: QUEUE_ID,
        customerId: CUSTOMER_ID,
        status: "waiting",
        displayNumber: "A-003",
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      cancelledTurnId: TURN_ID,
      cancelledDisplayNumber: "A-003",
    });
  });

  it("completes successfully even when no emitter is configured", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID }),
    ).resolves.toMatchObject({ cancelled: true });
  });
});

describe("CancelTurnUseCase — errores", () => {
  it("throws 404 when the turn does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
  });

  it("throws 403 when the customer does not own the turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: OTHER_CUSTOMER, status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "TURN_NOT_OWNED" });
  });

  it("throws 409 when trying to cancel a completed turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "completed" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CANCELLABLE" });
  });

  it("throws 409 when trying to cancel an already cancelled turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, status: "cancelled" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_NOT_CANCELLABLE" });
  });

  it("throws 400 for an invalid turnId UUID", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: "not-a-uuid", customerId: CUSTOMER_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for an invalid customerId UUID", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ turnId: TURN_ID, customerId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
