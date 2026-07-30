import { describe, expect, it, vi } from "vitest";

import { ConfirmTurnStatusUseCase } from "../../../src/modules/queue/application/ConfirmTurnStatusUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter  = options.emitter === undefined ? null : options.emitter;
  const useCase  = new ConfirmTurnStatusUseCase(turnRepo, emitter as never);
  return { useCase, turnRepo };
};

// ── HU-3.4: confirmar en tránsito ────────────────────────────────────────────

describe("ConfirmTurnStatusUseCase — confirm-transit (HU-3.4)", () => {
  it("upgrades priority from registered to in_transit", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "registered" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" });

    expect(result.priority).toBe("in_transit");
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.priority).toBe("in_transit");
  });

  it("returns the turn id, queueId and displayNumber", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, displayNumber: "A-005", priority: "registered" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" });

    expect(result).toMatchObject({ turnId: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-005" });
  });

  it("emits queue:update with updatedTurnId and in_transit priority", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "registered" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" });

    expect(emitQueueUpdate).toHaveBeenCalledOnce();
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      updatedTurnId: TURN_ID,
      updatedPriority: "in_transit",
    });
  });

  it("throws 409 when priority is already in_transit", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "in_transit" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });

  it("throws 409 when priority is already arrived (cannot go back)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "arrived" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });
});

// ── HU-3.5: confirmar llegada ─────────────────────────────────────────────────

describe("ConfirmTurnStatusUseCase — confirm-arrival (HU-3.5)", () => {
  it("upgrades priority from in_transit to arrived", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "in_transit" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "arrived" });

    expect(result.priority).toBe("arrived");
    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.priority).toBe("arrived");
  });

  it("emits queue:update with arrived priority", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "in_transit" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "arrived" });

    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      updatedTurnId: TURN_ID,
      updatedPriority: "arrived",
    });
  });

  it("throws 409 when trying to confirm arrival from registered (must go through in_transit first)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "registered" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "arrived" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });

  it("throws 409 when already at arrived priority", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "arrived" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "arrived" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
  });
});

// ── Errores comunes ───────────────────────────────────────────────────────────

describe("ConfirmTurnStatusUseCase — errores", () => {
  it("throws 404 when the customer has no active turn in this queue", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
  });

  it("throws 400 for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid", customerId: CUSTOMER_ID, action: "in_transit" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for an invalid customerId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: "not-a-uuid", action: "in_transit" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("works without emitter (no crash)", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: CUSTOMER_ID, priority: "registered" }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: null });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, customerId: CUSTOMER_ID, action: "in_transit" }),
    ).resolves.toMatchObject({ priority: "in_transit" });
  });
});
