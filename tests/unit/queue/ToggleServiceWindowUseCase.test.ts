import { describe, expect, it } from "vitest";

import { ToggleServiceWindowUseCase } from "../../../src/modules/queue/application/ToggleServiceWindowUseCase";
import { InMemoryServiceWindowRepo, InMemoryTurnRepo, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const WINDOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const buildUseCase = (options: {
  windowRepo?: InMemoryServiceWindowRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  return { useCase: new ToggleServiceWindowUseCase(windowRepo, turnRepo), windowRepo, turnRepo };
};

describe("ToggleServiceWindowUseCase", () => {
  it("deactivates an active window", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.isActive).toBe(false);
    expect(windowRepo.all()[0].isActive).toBe(false);
  });

  it("activates an inactive window", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: false }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.isActive).toBe(true);
    expect(windowRepo.all()[0].isActive).toBe(true);
  });

  it("updates updatedAt on toggle", async () => {
    const before = new Date();
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("does not modify other fields", async () => {
    const original = buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "customer_service", isActive: true });
    const windowRepo = new InMemoryServiceWindowRepo([original]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("customer_service");
    expect(result.queueId).toBe(original.queueId);
  });

  it("throws 404 when window does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ windowId: WINDOW_ID })).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
  });

  it("throws 400 for invalid windowId", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ windowId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("ToggleServiceWindowUseCase — ocupación", () => {
  it("throws 409 when trying to deactivate a window currently attending a turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    await expect(useCase.execute({ windowId: WINDOW_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_WINDOW_IN_USE",
    });
  });

  it("allows deactivating a window with no attending turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: true }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "called", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.isActive).toBe(false);
  });

  it("allows reactivating a window even if it would (hypothetically) be occupied", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: false }),
    ]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "attending", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.isActive).toBe(true);
  });
});
