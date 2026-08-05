import { describe, expect, it, vi } from "vitest";

import { SuspendBusinessUseCase } from "../../../src/modules/business/application/SuspendBusinessUseCase";
import {
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
  InMemoryRefreshSessionRepo,
  buildBusiness,
  buildBusinessEmployee,
} from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryTurnRepo, buildQueue, buildTurn } from "../../helpers/queueFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID    = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMPLOYEE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  employeeRepo?: InMemoryBusinessEmployeeRepo;
  refreshSessionRepo?: InMemoryRefreshSessionRepo;
  queueRepo?: InMemoryQueueRepo;
  turnRepo?: InMemoryTurnRepo;
  emitter?: { emitQueueUpdate: ReturnType<typeof vi.fn> } | null;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID, status: "approved" }),
  ]);
  const employeeRepo = options.employeeRepo ?? new InMemoryBusinessEmployeeRepo([
    buildBusinessEmployee({ id: "emp-1", businessId: BUSINESS_ID, userId: EMPLOYEE_ID, status: "active" }),
  ]);
  const refreshSessionRepo = options.refreshSessionRepo ?? new InMemoryRefreshSessionRepo();
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const turnRepo = options.turnRepo ?? new InMemoryTurnRepo();
  const emitter = options.emitter === undefined ? null : options.emitter;
  return {
    businessRepo, employeeRepo, refreshSessionRepo, queueRepo, turnRepo,
    useCase: new SuspendBusinessUseCase(businessRepo, employeeRepo, refreshSessionRepo, queueRepo, turnRepo, emitter as never),
  };
};

describe("SuspendBusinessUseCase", () => {
  it("suspends an approved business and records who/when/why", async () => {
    const { useCase, businessRepo } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "Fraude reportado" });

    expect(result.status).toBe("suspended");
    expect(result.suspendedByUserId).toBe(ADMIN_ID);
    expect(result.suspensionReason).toBe("Fraude reportado");
    expect(result.suspendedAt).toBeInstanceOf(Date);
    expect(businessRepo.all()[0].status).toBe("suspended");
  });

  it("revokes the owner's sessions", async () => {
    const { useCase, refreshSessionRepo } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" });

    expect(refreshSessionRepo.revokedUserIds).toContain(OWNER_ID);
  });

  it("revokes active employees' sessions but not revoked ones", async () => {
    const employeeRepo = new InMemoryBusinessEmployeeRepo([
      buildBusinessEmployee({ id: "emp-1", businessId: BUSINESS_ID, userId: EMPLOYEE_ID, status: "active" }),
      buildBusinessEmployee({ id: "emp-2", businessId: BUSINESS_ID, userId: "already-revoked-user", status: "revoked" }),
    ]);
    const { useCase, refreshSessionRepo } = buildUseCase({ employeeRepo });

    await useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" });

    expect(refreshSessionRepo.revokedUserIds).toContain(EMPLOYEE_ID);
    expect(refreshSessionRepo.revokedUserIds).not.toContain("already-revoked-user");
  });

  it("cancels active turns across all of the business's queues", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "queue-1", businessId: BUSINESS_ID }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", queueId: "queue-1", businessId: BUSINESS_ID, status: "waiting" }),
      buildTurn({ id: "turn-2", queueId: "queue-1", businessId: BUSINESS_ID, status: "attending" }),
      buildTurn({ id: "turn-3", queueId: "queue-1", businessId: BUSINESS_ID, status: "completed" }),
    ]);
    const { useCase } = buildUseCase({ queueRepo, turnRepo });

    await useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" });

    const turns = turnRepo.all();
    expect(turns.find((t) => t.id === "turn-1")?.status).toBe("cancelled");
    expect(turns.find((t) => t.id === "turn-2")?.status).toBe("cancelled");
    expect(turns.find((t) => t.id === "turn-3")?.status).toBe("completed");
  });

  it("emits queue:update for each cancelled turn", async () => {
    const emitQueueUpdate = vi.fn();
    const queueRepo = new InMemoryQueueRepo([buildQueue({ id: "queue-1", businessId: BUSINESS_ID })]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", queueId: "queue-1", businessId: BUSINESS_ID, displayNumber: "A-001", status: "waiting" }),
    ]);
    const { useCase } = buildUseCase({ queueRepo, turnRepo, emitter: { emitQueueUpdate } });

    await useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" });

    expect(emitQueueUpdate).toHaveBeenCalledWith("queue-1", {
      cancelledTurnId: "turn-1",
      cancelledDisplayNumber: "A-001",
    });
  });

  describe("errores", () => {
    it("throws 404 when business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 409 when business is pending (not yet operating)", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "pending" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_CANNOT_BE_SUSPENDED" });
    });

    it("throws 409 when business is already suspended", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "suspended" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_CANNOT_BE_SUSPENDED" });
    });

    it("throws 400 for an empty reason", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, suspendedByUserId: ADMIN_ID, reason: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
