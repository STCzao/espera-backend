import { describe, expect, it } from "vitest";

import { EnsureBusinessMembershipUseCase } from "../../../src/modules/business/application/EnsureBusinessMembershipUseCase";
import { ListServiceWindowsUseCase } from "../../../src/modules/queue/application/ListServiceWindowsUseCase";
import { InMemoryBusinessEmployeeRepo, InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, InMemoryTurnRepo, buildQueue, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const QUEUE_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUSINESS_ID = "business-1"; // matches buildQueue() default
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";

const buildUseCase = (options: {
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
  turnRepo?: InMemoryTurnRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const queueRepo  = options.queueRepo  ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID })]);
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const ensureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(
    businessRepo,
    new InMemoryBusinessEmployeeRepo(),
  );
  return { useCase: new ListServiceWindowsUseCase(queueRepo, windowRepo, turnRepo, ensureBusinessMembershipUseCase), windowRepo, turnRepo };
};

describe("ListServiceWindowsUseCase", () => {
  it("returns all windows for the queue ordered by createdAt", async () => {
    const w1 = buildServiceWindow({ id: "w-1", queueId: QUEUE_ID, name: "Ventanilla 1", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") });
    const w2 = buildServiceWindow({ id: "w-2", queueId: QUEUE_ID, name: "Ventanilla 2", createdAt: new Date("2026-01-02T00:00:00Z"), updatedAt: new Date("2026-01-02T00:00:00Z") });
    const { useCase } = buildUseCase({ windowRepo: new InMemoryServiceWindowRepo([w2, w1]) });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].name).toBe("Ventanilla 1");
    expect(result.windows[1].name).toBe("Ventanilla 2");
  });

  it("returns empty array when queue has no windows", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows).toHaveLength(0);
  });

  it("does not return windows from other queues", async () => {
    const w = buildServiceWindow({ id: "w-1", queueId: QUEUE_ID2 });
    const { useCase } = buildUseCase({ windowRepo: new InMemoryServiceWindowRepo([w]) });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows).toHaveLength(0);
  });

  it("returns currentTurn null when the window is free", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: QUEUE_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows[0].currentTurn).toBeNull();
  });

  it("returns currentTurn with the attending turn assigned to the window", async () => {
    const startedAttentionAt = new Date("2026-01-01T10:00:00Z");
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: QUEUE_ID }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({
        id: "t-1",
        queueId: QUEUE_ID,
        displayNumber: "A-001",
        status: "attending",
        serviceWindowId: "w-1",
        startedAttentionAt,
      }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows[0].currentTurn).toEqual({
      turnId: "t-1",
      displayNumber: "A-001",
      startedAttentionAt: startedAttentionAt.toISOString(),
    });
  });

  it("does not attach a called (not yet attending) turn as currentTurn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: QUEUE_ID }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "t-1", queueId: QUEUE_ID, status: "called", serviceWindowId: "w-1" }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID });

    expect(result.windows[0].currentTurn).toBeNull();
  });

  it("throws 404 when queue does not exist", async () => {
    const { useCase } = buildUseCase({ queueRepo: new InMemoryQueueRepo() });

    await expect(useCase.execute({ queueId: QUEUE_ID, requestingUserId: OWNER_ID })).rejects.toMatchObject({ statusCode: 404, code: "QUEUE_NOT_FOUND" });
  });

  it("throws 400 for an invalid queueId", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ queueId: "not-a-uuid", requestingUserId: OWNER_ID })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws BUSINESS_MEMBERSHIP_REQUIRED for a user unrelated to the business", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ queueId: QUEUE_ID, requestingUserId: STRANGER_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
  });
});
