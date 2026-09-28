import { describe, expect, it } from "vitest";

import { resolveTurnWaitStatus } from "../../../src/modules/queue/application/resolveTurnWaitStatus";
import {
  InMemoryServiceWindowRepo,
  InMemoryTurnRepo,
  buildServiceWindow,
  buildTurn,
} from "../../helpers/queueFakes";

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";

describe("resolveTurnWaitStatus", () => {
  it("short-circuits to position 0 and estimatedWaitMinutes 0 for a called turn", async () => {
    const turn = buildTurn({ queueId: QUEUE_ID, status: "called" });

    const result = await resolveTurnWaitStatus(turn, {
      turnRepo: new InMemoryTurnRepo(),
      windowRepo: new InMemoryServiceWindowRepo(),
    });

    expect(result).toEqual({
      status: "called",
      position: 0,
      estimatedWaitMinutes: 0,
      serviceWindowId: turn.serviceWindowId ?? null,
    });
  });

  it("short-circuits for an attending turn and surfaces its serviceWindowId", async () => {
    const turn = buildTurn({ queueId: QUEUE_ID, status: "attending", serviceWindowId: "window-1" });

    const result = await resolveTurnWaitStatus(turn, {
      turnRepo: new InMemoryTurnRepo(),
      windowRepo: new InMemoryServiceWindowRepo(),
    });

    expect(result).toMatchObject({ status: "attending", position: 0, serviceWindowId: "window-1" });
  });

  it("short-circuits for a redirected turn", async () => {
    const turn = buildTurn({ queueId: QUEUE_ID, status: "redirected", serviceWindowId: "window-1" });

    const result = await resolveTurnWaitStatus(turn, {
      turnRepo: new InMemoryTurnRepo(),
      windowRepo: new InMemoryServiceWindowRepo(),
    });

    expect(result).toMatchObject({ status: "redirected", position: 0 });
  });

  it("returns position ahead+1 and an estimate for a waiting turn", async () => {
    const turn = buildTurn({ id: "t-mine", queueId: QUEUE_ID, number: 2, status: "waiting" });
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-ahead", queueId: QUEUE_ID, number: 1, status: "waiting" }),
      turn,
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: true }),
    ]);

    const result = await resolveTurnWaitStatus(turn, { turnRepo, windowRepo });

    expect(result.status).toBe("waiting");
    expect(result.position).toBe(2);
    expect(result.estimatedWaitMinutes).toEqual(expect.any(Number));
    expect(result.serviceWindowId).toBeNull();
  });

  it("returns a null estimate when the queue has no active service windows", async () => {
    const turn = buildTurn({ queueId: QUEUE_ID, status: "waiting" });
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "window-1", queueId: QUEUE_ID, isActive: false }),
    ]);

    const result = await resolveTurnWaitStatus(turn, {
      turnRepo: new InMemoryTurnRepo([turn]),
      windowRepo,
    });

    expect(result.estimatedWaitMinutes).toBeNull();
  });
});
