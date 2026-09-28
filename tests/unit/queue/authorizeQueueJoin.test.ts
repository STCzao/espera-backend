import { describe, expect, it, vi } from "vitest";

import { authorizeQueueJoin } from "../../../src/modules/queue/infrastructure/realtime/authorizeQueueJoin";
import type { QueueJoinDeps } from "../../../src/modules/queue/infrastructure/realtime/authorizeQueueJoin";
import { AppError } from "../../../src/shared/kernel/AppError";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue, buildTurn } from "../../helpers/queueFakes";

const QUEUE_ID = "queue-1";
const BUSINESS_ID = "business-1";
const STAFF_ID = "staff-1";

const buildDeps = (overrides: Partial<QueueJoinDeps> = {}): QueueJoinDeps => ({
  turnRepo: new InMemoryTurnRepo(),
  queueRepo: new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]),
  // Stands in for EnsureBusinessMembershipUseCase, which rejects by throwing.
  assertStaffAccess: vi.fn(async () => {}),
  requireStaffAuth: false,
  ...overrides,
});

const rejectingStaffAccess = () =>
  vi.fn(async () => {
    throw AppError.forbidden("You do not have access to this business.", "BUSINESS_MEMBERSHIP_REQUIRED");
  });

describe("authorizeQueueJoin — invitado con turnId", () => {
  it("allows a turnId that belongs to the requested queue, with no session at all", async () => {
    const turnRepo = new InMemoryTurnRepo([buildTurn({ id: "turn-1", queueId: QUEUE_ID })]);

    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, turnId: "turn-1" }, buildDeps({ turnRepo })),
    ).resolves.toEqual({ allowed: true, reason: "guest_turn" });
  });

  it("keeps working for a guest even once the staff flag is on", async () => {
    const turnRepo = new InMemoryTurnRepo([buildTurn({ id: "turn-1", queueId: QUEUE_ID })]);

    await expect(
      authorizeQueueJoin(
        { queueId: QUEUE_ID, turnId: "turn-1", userId: null },
        buildDeps({ turnRepo, requireStaffAuth: true }),
      ),
    ).resolves.toEqual({ allowed: true, reason: "guest_turn" });
  });

  it("rejects a turnId that belongs to a different queue", async () => {
    const turnRepo = new InMemoryTurnRepo([buildTurn({ id: "turn-1", queueId: "queue-2" })]);

    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, turnId: "turn-1" }, buildDeps({ turnRepo })),
    ).resolves.toEqual({ allowed: false, reason: "turn_mismatch" });
  });

  it("rejects an unknown turnId", async () => {
    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, turnId: "nope" }, buildDeps()),
    ).resolves.toEqual({ allowed: false, reason: "turn_mismatch" });
  });

  it("never consults the staff check for a guest join", async () => {
    const turnRepo = new InMemoryTurnRepo([buildTurn({ id: "turn-1", queueId: QUEUE_ID })]);
    const assertStaffAccess = vi.fn(async () => {});

    await authorizeQueueJoin({ queueId: QUEUE_ID, turnId: "turn-1" }, buildDeps({ turnRepo, assertStaffAccess }));

    expect(assertStaffAccess).not.toHaveBeenCalled();
  });
});

describe("authorizeQueueJoin — panel del personal", () => {
  it("allows a member of the queue's business, asking about that exact business", async () => {
    const assertStaffAccess = vi.fn(async () => {});

    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, userId: STAFF_ID }, buildDeps({ assertStaffAccess })),
    ).resolves.toEqual({ allowed: true, reason: "staff" });
    expect(assertStaffAccess).toHaveBeenCalledWith(BUSINESS_ID, STAFF_ID);
  });

  it("rejects staff of another business, even with a perfectly valid session", async () => {
    await expect(
      authorizeQueueJoin(
        { queueId: QUEUE_ID, userId: "outsider" },
        buildDeps({ assertStaffAccess: rejectingStaffAccess() }),
      ),
    ).resolves.toEqual({ allowed: false, reason: "not_staff" });
  });

  it("rejects a queueId that does not exist, without asking about membership", async () => {
    const assertStaffAccess = vi.fn(async () => {});

    await expect(
      authorizeQueueJoin(
        { queueId: "ghost-queue", userId: STAFF_ID },
        buildDeps({ assertStaffAccess }),
      ),
    ).resolves.toEqual({ allowed: false, reason: "queue_not_found" });
    expect(assertStaffAccess).not.toHaveBeenCalled();
  });
});

describe("authorizeQueueJoin — etapas del cierre", () => {
  it("lets an unauthenticated panel in while the flag is off, flagged for counting", async () => {
    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, userId: null }, buildDeps({ requireStaffAuth: false })),
    ).resolves.toEqual({ allowed: true, reason: "unauthenticated_legacy" });
  });

  it("refuses the same join once the flag is on", async () => {
    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID, userId: null }, buildDeps({ requireStaffAuth: true })),
    ).resolves.toEqual({ allowed: false, reason: "not_staff" });
  });

  it("treats a missing userId the same as an explicit null (anonymous socket)", async () => {
    await expect(
      authorizeQueueJoin({ queueId: QUEUE_ID }, buildDeps({ requireStaffAuth: true })),
    ).resolves.toEqual({ allowed: false, reason: "not_staff" });
  });

  it("never reaches the database for an anonymous join, whatever the flag says", async () => {
    const assertStaffAccess = vi.fn(async () => {});

    for (const requireStaffAuth of [true, false]) {
      await authorizeQueueJoin({ queueId: QUEUE_ID, userId: null }, buildDeps({ assertStaffAccess, requireStaffAuth }));
    }

    expect(assertStaffAccess).not.toHaveBeenCalled();
  });
});

describe("authorizeQueueJoin — payload invalido", () => {
  it("rejects a join with no queueId, whoever is asking", async () => {
    for (const request of [{ turnId: "turn-1" }, { userId: STAFF_ID }, {}]) {
      await expect(authorizeQueueJoin(request, buildDeps())).resolves.toEqual({
        allowed: false,
        reason: "no_queue_id",
      });
    }
  });
});
