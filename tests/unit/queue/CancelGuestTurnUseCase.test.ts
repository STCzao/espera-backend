import { describe, expect, it, vi } from "vitest";

import { CancelGuestTurnUseCase } from "../../../src/modules/queue/application/CancelGuestTurnUseCase";
import { InMemoryTurnRepo, buildTurn } from "../../helpers/queueFakes";

const TURN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (turnRepo: InMemoryTurnRepo, emitQueueUpdate = vi.fn()) => ({
  useCase: new CancelGuestTurnUseCase(turnRepo, { emitQueueUpdate } as never),
  emitQueueUpdate,
});

describe("CancelGuestTurnUseCase", () => {
  it("cancels a waiting guest turn and tells the queue room", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-004", status: "waiting", guestName: "Ana" }),
    ]);
    const { useCase, emitQueueUpdate } = buildUseCase(turnRepo);

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toEqual({ cancelled: true, turnId: TURN_ID });
    expect(turnRepo.all()[0]).toMatchObject({ status: "cancelled" });
    expect(turnRepo.all()[0].cancelledAt).toBeInstanceOf(Date);
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      cancelledTurnId: TURN_ID,
      cancelledDisplayNumber: "A-004",
    });
  });

  it("refuses a turn that belongs to an account: knowing its id is not enough", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, customerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: "waiting" }),
    ]);
    const { useCase } = buildUseCase(turnRepo);

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({
      statusCode: 403,
      code: "TURN_NOT_GUEST",
    });
    expect(turnRepo.all()[0].status).toBe("waiting");
  });

  it.each(["called", "attending", "redirected", "completed", "cancelled", "no_show"] as const)(
    "refuses a turn that is already %s (its id may have been broadcast to the queue room)",
    async (status) => {
      const turnRepo = new InMemoryTurnRepo([buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status })]);
      const { useCase, emitQueueUpdate } = buildUseCase(turnRepo);

      await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({
        statusCode: 409,
        code: "TURN_NOT_CANCELLABLE",
      });
      expect(emitQueueUpdate).not.toHaveBeenCalled();
    },
  );

  it("throws 404 for an unknown turn and 400 for a malformed id", async () => {
    const { useCase } = buildUseCase(new InMemoryTurnRepo());

    await expect(useCase.execute({ turnId: TURN_ID })).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
    await expect(useCase.execute({ turnId: "nope" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
