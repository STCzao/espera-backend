import { describe, expect, it, vi } from "vitest";

import { EnsureBusinessMembershipUseCase } from "../../../src/modules/business/application/EnsureBusinessMembershipUseCase";
import { RedirectTurnUseCase } from "../../../src/modules/queue/application/RedirectTurnUseCase";
import { InMemoryBusinessEmployeeRepo, InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryServiceWindowRepo, InMemoryTurnRepo, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const TURN_ID     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WINDOW_A_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WINDOW_B_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BUSINESS_ID = "business-1"; // matches buildTurn() default
const OWNER_ID = "11111111-2222-4333-8444-555555555555";
const STRANGER_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const buildUseCase = (options: {
  turnRepo?: InMemoryTurnRepo;
  windowRepo?: InMemoryServiceWindowRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo([
    buildServiceWindow({ id: WINDOW_A_ID, queueId: QUEUE_ID, name: "Atención al cliente" }),
    buildServiceWindow({ id: WINDOW_B_ID, queueId: QUEUE_ID, name: "Caja" }),
  ]);
  const emitter = options.emitter === undefined ? null : options.emitter;
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const ensureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(
    businessRepo,
    new InMemoryBusinessEmployeeRepo(),
  );
  return {
    useCase: new RedirectTurnUseCase(turnRepo, windowRepo, emitter as never, ensureBusinessMembershipUseCase),
    turnRepo,
    windowRepo,
  };
};

describe("RedirectTurnUseCase", () => {
  it("moves an attending turn to redirected with the target window", async () => {
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    const result = await useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID });

    expect(result).toMatchObject({ turnId: TURN_ID, status: "redirected", serviceWindowId: WINDOW_B_ID });
    const saved = turnRepo.all().find((t) => t.id === TURN_ID);
    expect(saved?.status).toBe("redirected");
    expect(saved?.serviceWindowId).toBe(WINDOW_B_ID);
  });

  it("preserves the original startedAttentionAt (total service time across windows)", async () => {
    const originalStart = new Date("2026-01-01T10:00:00.000Z");
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: TURN_ID, queueId: QUEUE_ID, status: "attending",
        serviceWindowId: WINDOW_A_ID, startedAttentionAt: originalStart,
      }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID });

    expect(turnRepo.all().find((t) => t.id === TURN_ID)?.startedAttentionAt).toEqual(originalStart);
  });

  it("emits queue:update with redirect details", async () => {
    const emitQueueUpdate = vi.fn();
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, displayNumber: "A-005", status: "attending", serviceWindowId: WINDOW_A_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID });

    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      redirectedTurnId: TURN_ID,
      redirectedDisplayNumber: "A-005",
      targetServiceWindowId: WINDOW_B_ID,
    });
  });

  it("allows redirecting to a window that already has another turn queued as redirected there", async () => {
    // Redirect just queues the customer behind that window virtually; it does not
    // start service immediately (unlike attend), so stacking is fine.
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
      buildTurn({ id: "other-turn", queueId: QUEUE_ID, status: "redirected", serviceWindowId: WINDOW_B_ID }),
    ]);
    const { useCase } = buildUseCase({ turnRepo });

    await expect(
      useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID }),
    ).resolves.toMatchObject({ status: "redirected" });
  });

  describe("errores", () => {
    it("throws 404 when the turn does not exist", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "TURN_NOT_FOUND" });
    });

    it("throws 409 when the turn is not attending", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "called" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "TURN_INVALID_STATUS_FOR_ATTEND" });
    });

    it("throws 400 when redirecting to the same window the turn is already in", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_A_ID }),
      ).rejects.toMatchObject({ statusCode: 400, code: "REDIRECT_SAME_WINDOW" });
    });

    it("throws 404 when the target window does not exist", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
    });

    it("throws 404 when the target window belongs to a different queue", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
      ]);
      const windowRepo = new InMemoryServiceWindowRepo([
        buildServiceWindow({ id: WINDOW_A_ID, queueId: QUEUE_ID }),
        buildServiceWindow({ id: WINDOW_B_ID, queueId: "other-queue" }),
      ]);
      const { useCase } = buildUseCase({ turnRepo, windowRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
    });

    it("throws 400 for an invalid turnId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ turnId: "not-a-uuid", requestingUserId: OWNER_ID, targetServiceWindowId: WINDOW_B_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws BUSINESS_MEMBERSHIP_REQUIRED for a user unrelated to the business", async () => {
      const turnRepo = new InMemoryTurnRepo([
        buildTurn({ id: TURN_ID, queueId: QUEUE_ID, status: "attending", serviceWindowId: WINDOW_A_ID }),
      ]);
      const { useCase } = buildUseCase({ turnRepo });

      await expect(
        useCase.execute({ turnId: TURN_ID, requestingUserId: STRANGER_ID, targetServiceWindowId: WINDOW_B_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
    });
  });
});
