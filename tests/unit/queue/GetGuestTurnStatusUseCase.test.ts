import { describe, expect, it } from "vitest";

import { GetGuestTurnStatusUseCase } from "../../../src/modules/queue/application/GetGuestTurnStatusUseCase";
import { InMemoryServiceWindowRepo, InMemoryTurnRepo, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";
const TURN_ID = "22222222-2222-4222-8222-222222222222";
const TODAY = new Date("2026-01-01T00:00:00.000Z");

const oneActiveWindow = () => new InMemoryServiceWindowRepo([
  buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
]);

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo([
    buildTurn({ id: TURN_ID, queueId: QUEUE_ID, guestName: "Juan Pérez", status: "waiting", turnDate: TODAY }),
  ]);
  const windowRepo = options.windowRepo ?? oneActiveWindow();
  return new GetGuestTurnStatusUseCase(turnRepo, windowRepo);
};

describe("GetGuestTurnStatusUseCase", () => {
  it("returns position and estimate for a waiting turn", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({
      turnId: TURN_ID,
      queueId: QUEUE_ID,
      status: "waiting",
      position: 1,
    });
  });

  it("returns position 0 when the turn was called", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, guestName: "Juan Pérez", status: "called", turnDate: TODAY, serviceWindowId: "window-1" }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ status: "called", position: 0, estimatedWaitMinutes: 0, serviceWindowId: "window-1" });
  });

  it("returns a terminal status for a completed turn instead of treating it as waiting", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, guestName: "Juan Pérez", status: "completed", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ status: "completed", position: 0, estimatedWaitMinutes: null });
  });

  it("returns a terminal status for a cancelled turn", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, guestName: "Juan Pérez", status: "cancelled", turnDate: TODAY }),
    ]);
    const useCase = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID });

    expect(result).toMatchObject({ status: "cancelled", position: 0, estimatedWaitMinutes: null });
  });

  describe("errores", () => {
    it("throws 404 when the turn does not exist", async () => {
      const useCase = buildUseCase({ turnRepo: new InMemoryTurnRepo() });

      await expect(
        useCase.execute({ turnId: TURN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
    });

    it("throws 400 for an invalid turnId", async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute({ turnId: "not-a-uuid" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
