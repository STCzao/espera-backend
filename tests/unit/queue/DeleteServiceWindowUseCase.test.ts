import { describe, expect, it } from "vitest";

import { DeleteServiceWindowUseCase } from "../../../src/modules/queue/application/DeleteServiceWindowUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, InMemoryTurnRepo, buildQueue, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const WINDOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUEUE_ID = "queue-1";
const BUSINESS_ID = "business-1";
const OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  windowRepo?: InMemoryServiceWindowRepo;
  turnRepo?: InMemoryTurnRepo;
  queueRepo?: InMemoryQueueRepo;
  businessRepo?: InMemoryBusinessRepo;
} = {}) => {
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo([buildQueue({ id: QUEUE_ID, businessId: BUSINESS_ID })]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  return { useCase: new DeleteServiceWindowUseCase(windowRepo, turnRepo, queueRepo, businessRepo), windowRepo, turnRepo };
};

describe("DeleteServiceWindowUseCase", () => {
  it("deletes an existing window with no attending turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID });

    expect(result).toEqual({ deleted: true, windowId: WINDOW_ID });
    expect(windowRepo.all()).toHaveLength(0);
  });

  it("throws 409 when the window is currently attending a turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    await expect(
      useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_WINDOW_IN_USE" });
    expect(windowRepo.all()).toHaveLength(1);
  });

  it("throws 409 when a turn was redirected to this window but hasn't started attending yet", async () => {
    // A redirected turn already claims the window even before staff taps to
    // start attending it — deleting it here would strand that turn.
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "redirected", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    await expect(
      useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_WINDOW_IN_USE" });
    expect(windowRepo.all()).toHaveLength(1);
  });

  describe("errores", () => {
    it("throws 404 when window does not exist", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ windowId: WINDOW_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business behind the window's queue", async () => {
      const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
      const { useCase } = buildUseCase({ windowRepo });

      await expect(
        useCase.execute({ windowId: WINDOW_ID, ownerUserId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
      expect(windowRepo.all()).toHaveLength(1);
    });

    it("throws 400 for invalid windowId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ windowId: "not-a-uuid", ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
