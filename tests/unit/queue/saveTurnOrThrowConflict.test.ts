import { describe, expect, it } from "vitest";

import { TurnConflictError } from "../../../src/modules/queue/domain/ITurnRepo";
import { saveTurnOrThrowConflict } from "../../../src/modules/queue/application/saveTurnOrThrowConflict";
import { buildTurn, InMemoryTurnRepo } from "../../helpers/queueFakes";

describe("saveTurnOrThrowConflict", () => {
  it("returns the saved turn on a normal, non-racing save", async () => {
    const turn = buildTurn({ id: "t-1", status: "waiting" });
    const turnRepo = new InMemoryTurnRepo([turn]);

    const result = await saveTurnOrThrowConflict(turnRepo, { ...turn, status: "called" });

    expect(result.status).toBe("called");
  });

  it("translates TurnConflictError into a 409 TURN_CONFLICT AppError", async () => {
    const turn = buildTurn({ id: "t-1", status: "waiting" });
    const turnRepo = {
      save: async () => {
        throw new TurnConflictError(turn.id);
      },
    };

    await expect(saveTurnOrThrowConflict(turnRepo, turn)).rejects.toMatchObject({
      statusCode: 409,
      code: "TURN_CONFLICT",
    });
  });

  it("rethrows any other error unchanged", async () => {
    const turn = buildTurn({ id: "t-1", status: "waiting" });
    const boom = new Error("boom");
    const turnRepo = {
      save: async () => {
        throw boom;
      },
    };

    await expect(saveTurnOrThrowConflict(turnRepo, turn)).rejects.toBe(boom);
  });
});
