import { describe, expect, it, vi } from "vitest";

import { CreateGuestTurnUseCase, MAX_ACTIVE_GUEST_TURNS_PER_QUEUE } from "../../../src/modules/queue/application/CreateGuestTurnUseCase";
import { CreateTurnUseCase } from "../../../src/modules/queue/application/CreateTurnUseCase";
import { InMemoryBusinessHoursRepo, InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue, buildTurn } from "../../helpers/queueFakes";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const QUEUE_ID = "22222222-2222-4222-8222-222222222222";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  businessRepo?: InMemoryBusinessRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([
    buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
  ]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "normal" }),
  ]);
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const createTurnUseCase = new CreateTurnUseCase(queueRepo, turnRepo, businessRepo, new InMemoryBusinessHoursRepo());
  return { useCase: new CreateGuestTurnUseCase(queueRepo, createTurnUseCase, turnRepo), turnRepo };
};

describe("CreateGuestTurnUseCase", () => {
  it("resolves the business's active queue and creates a guest turn", async () => {
    const { useCase, turnRepo } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" });

    expect(result.queueId).toBe(QUEUE_ID);
    expect(result.displayNumber).toBe("A-001");
    expect(turnRepo.all()[0]).toMatchObject({ guestName: "Juan Pérez", source: "web" });
  });

  describe("tope de turnos de invitado activos por cola", () => {
    const guestTurns = (count: number, overrides: Partial<ReturnType<typeof buildTurn>> = {}) =>
      Array.from({ length: count }, (_, i) =>
        buildTurn({ id: `guest-${i}-${overrides.status ?? "waiting"}`, queueId: QUEUE_ID, status: "waiting", ...overrides }),
      );

    it("rejects with 409 GUEST_TURN_LIMIT_REACHED once the queue holds the maximum", async () => {
      const { useCase, turnRepo } = buildUseCase({
        turnRepo: new InMemoryTurnRepo(guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE)),
      });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "GUEST_TURN_LIMIT_REACHED" });
      expect(turnRepo.all()).toHaveLength(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE);
    });

    it("still accepts one below the maximum", async () => {
      const { useCase } = buildUseCase({
        turnRepo: new InMemoryTurnRepo(guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE - 1)),
      });

      await expect(useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" })).resolves.toBeDefined();
    });

    it("does not count finished turns, account turns or other queues' turns", async () => {
      const noise = [
        ...guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE, { status: "completed" }),
        ...guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE, { status: "cancelled" }),
        ...guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE, { customerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }).map((t, i) => ({ ...t, id: `acct-${i}` })),
        ...guestTurns(MAX_ACTIVE_GUEST_TURNS_PER_QUEUE, { queueId: "other-queue" }).map((t, i) => ({ ...t, id: `other-${i}` })),
      ];
      const { useCase } = buildUseCase({ turnRepo: new InMemoryTurnRepo(noise) });

      await expect(useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" })).resolves.toBeDefined();
    });
  });

  describe("errores", () => {
    it("throws 404 when the business has no active queue", async () => {
      const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 when guestName is empty", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("propagates business rules from CreateTurnUseCase (e.g. business paused)", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "paused" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, guestName: "Juan Pérez" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_OPERATIONAL_STATUS_BLOCKED" });
    });
  });
});

describe("CreateGuestTurnUseCase — aviso al panel", () => {
  // Este use case NO recibe emitter: delega la creacion en CreateTurnUseCase,
  // asi que el aviso sale de alli. Tener su propio emitter seria un segundo
  // queue:update por el mismo turno.
  const build = () => {
    const emitQueueUpdate = vi.fn();
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A", isActive: true }),
    ]);
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "normal" }),
    ]);
    const turnRepo = new InMemoryTurnRepo();
    const createTurnUseCase = new CreateTurnUseCase(
      queueRepo, turnRepo, businessRepo, new InMemoryBusinessHoursRepo(), undefined,
      { emitQueueUpdate } as never,
    );
    return {
      useCase: new CreateGuestTurnUseCase(queueRepo, createTurnUseCase, turnRepo),
      emitQueueUpdate,
      turnRepo,
    };
  };

  it("emits exactly once — not twice — for a guest turn", async () => {
    const { useCase, emitQueueUpdate } = build();

    const result = await useCase.execute({ businessId: BUSINESS_ID, guestName: "Ana" });

    expect(emitQueueUpdate).toHaveBeenCalledTimes(1);
    expect(emitQueueUpdate).toHaveBeenCalledWith(QUEUE_ID, {
      createdTurnId: result.turnId,
      createdDisplayNumber: result.displayNumber,
    });
  });

  it("does not emit when the guest limit is already reached", async () => {
    const { useCase, emitQueueUpdate, turnRepo } = build();
    for (let i = 0; i < MAX_ACTIVE_GUEST_TURNS_PER_QUEUE; i++) {
      await turnRepo.save(buildTurn({ id: `guest-${i}`, queueId: QUEUE_ID, status: "waiting" }));
    }

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, guestName: "Ana" }),
    ).rejects.toMatchObject({ code: "GUEST_TURN_LIMIT_REACHED" });
    expect(emitQueueUpdate).not.toHaveBeenCalled();
  });

  it("does not emit when the business has no active queue", async () => {
    const emitQueueUpdate = vi.fn();
    const useCase = new CreateGuestTurnUseCase(
      new InMemoryQueueRepo(),
      new CreateTurnUseCase(undefined, undefined, undefined, undefined, undefined, { emitQueueUpdate } as never),
      new InMemoryTurnRepo(),
    );

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, guestName: "Ana" }),
    ).rejects.toMatchObject({ code: "QUEUE_NOT_FOUND" });
    expect(emitQueueUpdate).not.toHaveBeenCalled();
  });
});
