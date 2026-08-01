import { describe, expect, it } from "vitest";

import { DeleteServiceWindowUseCase } from "../../../src/modules/queue/application/DeleteServiceWindowUseCase";
import { InMemoryServiceWindowRepo, InMemoryTurnRepo, buildServiceWindow, buildTurn } from "../../helpers/queueFakes";

const WINDOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const buildUseCase = (options: {
  windowRepo?: InMemoryServiceWindowRepo;
  turnRepo?: InMemoryTurnRepo;
} = {}) => {
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  const turnRepo   = options.turnRepo   ?? new InMemoryTurnRepo();
  return { useCase: new DeleteServiceWindowUseCase(windowRepo, turnRepo), windowRepo, turnRepo };
};

describe("DeleteServiceWindowUseCase", () => {
  it("deletes an existing window with no attending turn", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const { useCase } = buildUseCase({ windowRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

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
      useCase.execute({ windowId: WINDOW_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_WINDOW_IN_USE" });
    expect(windowRepo.all()).toHaveLength(1);
  });

  it("allows deleting a window with a redirected (not yet attending) turn queued for it", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const turnRepo = new InMemoryTurnRepo([
      buildTurn({ id: "turn-1", status: "redirected", serviceWindowId: WINDOW_ID }),
    ]);
    const { useCase } = buildUseCase({ windowRepo, turnRepo });

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.deleted).toBe(true);
  });

  it("throws 404 when window does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ windowId: WINDOW_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
  });

  it("throws 400 for invalid windowId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ windowId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
