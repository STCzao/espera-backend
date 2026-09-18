import { describe, expect, it } from "vitest";

import { authorizeQueueJoin } from "../../../src/modules/queue/infrastructure/realtime/authorizeQueueJoin";
import { buildTurn, InMemoryTurnRepo } from "../../helpers/queueFakes";

describe("authorizeQueueJoin", () => {
  it("rejects a join with no queueId", async () => {
    const turnRepo = new InMemoryTurnRepo();

    await expect(authorizeQueueJoin({ turnId: "turn-1" }, turnRepo)).resolves.toBe(false);
  });

  it("allows a bare queueId join with no turnId (staff panel, unchanged)", async () => {
    const turnRepo = new InMemoryTurnRepo();

    await expect(authorizeQueueJoin({ queueId: "queue-1" }, turnRepo)).resolves.toBe(true);
  });

  it("allows a turnId that belongs to the requested queue (web ligera guest)", async () => {
    const turn = buildTurn({ id: "turn-1", queueId: "queue-1" });
    const turnRepo = new InMemoryTurnRepo([turn]);

    await expect(
      authorizeQueueJoin({ queueId: "queue-1", turnId: "turn-1" }, turnRepo),
    ).resolves.toBe(true);
  });

  it("rejects a turnId that belongs to a different queue", async () => {
    const turn = buildTurn({ id: "turn-1", queueId: "queue-2" });
    const turnRepo = new InMemoryTurnRepo([turn]);

    await expect(
      authorizeQueueJoin({ queueId: "queue-1", turnId: "turn-1" }, turnRepo),
    ).resolves.toBe(false);
  });

  it("rejects an unknown turnId", async () => {
    const turnRepo = new InMemoryTurnRepo();

    await expect(
      authorizeQueueJoin({ queueId: "queue-1", turnId: "does-not-exist" }, turnRepo),
    ).resolves.toBe(false);
  });
});
