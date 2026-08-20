import { describe, expect, it } from "vitest";

import { CreateManualTurnUseCase } from "../../../src/modules/queue/application/CreateManualTurnUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue } from "../../helpers/queueFakes";

const QUEUE_ID    = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

const buildUseCase = (options: {
  queueRepo?:    InMemoryQueueRepo;
  turnRepo?:     InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo    = options.queueRepo    ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, prefix: "A" })]);
  const turnRepo     = options.turnRepo     ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, status: "approved" })]);
  return { useCase: new CreateManualTurnUseCase(queueRepo, turnRepo, businessRepo), turnRepo };
};

describe("CreateManualTurnUseCase — creación exitosa", () => {
  it("creates a turn with priority physical and source manual", async () => {
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" });

    const turn = turnRepo.all()[0];
    expect(turn.priority).toBe("physical");
    expect(turn.source).toBe("manual");
  });

  it("stores the guestName on the turn", async () => {
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "María López" });

    expect(turnRepo.all()[0].guestName).toBe("María López");
  });

  it("returns turnId, queueId, displayNumber, guestName and position", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, guestName: "Carlos" });

    expect(result).toMatchObject({
      queueId:       QUEUE_ID,
      displayNumber: "A-001",
      guestName:     "Carlos",
      position:      1,
    });
    expect(result.turnId).toBeTruthy();
  });

  it("does not set customerId on the turn", async () => {
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Invitado" });

    expect(turnRepo.all()[0].customerId).toBeUndefined();
  });

  it("assigns correlative numbers for multiple manual turns", async () => {
    const { useCase } = buildUseCase();

    const first  = await useCase.execute({ queueId: QUEUE_ID, guestName: "A" });
    const second = await useCase.execute({ queueId: QUEUE_ID, guestName: "B" });

    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    expect(second.displayNumber).toBe("A-002");
  });
});

describe("CreateManualTurnUseCase — reserva por teléfono (HU-4.5)", () => {
  it("creates a phone-sourced turn with priority registered, not physical", async () => {
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone", phone: "+54 381 555-1234" });

    const turn = turnRepo.all()[0];
    expect(turn.source).toBe("phone");
    // The whole point of the fix: a phone reservation must NOT jump ahead of
    // people already waiting or on their way — same priority as any other
    // remote/unconfirmed turn (app/QR/web).
    expect(turn.priority).toBe("registered");
    expect(turn.phone).toBe("+54 381 555-1234");
  });

  it("returns phone and source in the output", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone", phone: "+54 381 555-1234" });

    expect(result).toMatchObject({ phone: "+54 381 555-1234", source: "phone" });
  });

  it("returns phone: null when no phone is given for a walk-in", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" });

    expect(result).toMatchObject({ phone: null, source: "manual" });
  });

  it("still allows a phone-sourced turn without a phone number", async () => {
    // phone is optional even for source "phone" — e.g. staff took the call
    // but the caller didn't want to share a number to be reachable at.
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone" });

    const turn = turnRepo.all()[0];
    expect(turn.source).toBe("phone");
    expect(turn.priority).toBe("registered");
    expect(turn.phone).toBeUndefined();
  });

  it("throws 400 for an invalid source value", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "qr" as never }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("CreateManualTurnUseCase — etaMinutes y queueJoinedAt (fairness)", () => {
  it("sets queueJoinedAt to now when no etaMinutes is given for a phone reservation", async () => {
    const before = new Date();
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone" });

    const turn = turnRepo.all()[0];
    expect(turn.queueJoinedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("pushes queueJoinedAt into the future by etaMinutes for a phone reservation", async () => {
    const before = new Date();
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone", etaMinutes: 360 });

    const turn = turnRepo.all()[0];
    const deltaMinutes = (turn.queueJoinedAt.getTime() - before.getTime()) / 60_000;
    expect(deltaMinutes).toBeGreaterThan(359);
    expect(deltaMinutes).toBeLessThan(361);
  });

  it("ignores etaMinutes for a walk-in (source manual) — always joins now", async () => {
    const before = new Date();
    const { useCase, turnRepo } = buildUseCase();

    await useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", etaMinutes: 360 });

    const turn = turnRepo.all()[0];
    const deltaMinutes = (turn.queueJoinedAt.getTime() - before.getTime()) / 60_000;
    expect(deltaMinutes).toBeLessThan(1);
  });

  it("throws 400 for a negative etaMinutes", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan", source: "phone", etaMinutes: -5 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("CreateManualTurnUseCase — errores", () => {
  it("throws 404 when the queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws 409 when the queue is inactive", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID, isActive: false }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "QUEUE_NOT_ACCEPTING_TURNS" });
  });

  it("throws 409 when the business is not approved", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, status: "pending" }),
    ]);
    const { useCase } = buildUseCase({ businessRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_NOT_ACCEPTING_CUSTOMERS" });
  });

  it("throws 409 when the business is paused", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, status: "approved", operationalStatus: "paused" }),
    ]);
    const { useCase } = buildUseCase({ businessRepo });

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "Juan" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_OPERATIONAL_STATUS_BLOCKED" });
  });

  it("throws 400 when guestName is empty", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, guestName: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: "not-a-uuid", guestName: "Juan" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
