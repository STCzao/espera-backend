import { describe, expect, it } from "vitest";

import { UpdateServiceWindowUseCase } from "../../../src/modules/queue/application/UpdateServiceWindowUseCase";
import { InMemoryServiceWindowRepo, buildServiceWindow } from "../../helpers/queueFakes";

const WINDOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const buildUseCase = (windowRepo = new InMemoryServiceWindowRepo()) =>
  ({ useCase: new UpdateServiceWindowUseCase(windowRepo), windowRepo });

describe("UpdateServiceWindowUseCase", () => {
  it("updates the name", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "cashier" }),
    ]);
    const { useCase } = buildUseCase(windowRepo);

    const result = await useCase.execute({ windowId: WINDOW_ID, name: "Caja Rápida" });

    expect(result.name).toBe("Caja Rápida");
    expect(result.type).toBe("cashier");
  });

  it("updates the type", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "cashier" }),
    ]);
    const { useCase } = buildUseCase(windowRepo);

    const result = await useCase.execute({ windowId: WINDOW_ID, type: "technical" });

    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("technical");
  });

  it("updates both name and type together", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "cashier" }),
    ]);
    const { useCase } = buildUseCase(windowRepo);

    const result = await useCase.execute({ windowId: WINDOW_ID, name: "Soporte", type: "technical" });

    expect(result.name).toBe("Soporte");
    expect(result.type).toBe("technical");
  });

  it("keeps existing fields when neither is provided", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, name: "Ventanilla 1", type: "cashier" }),
    ]);
    const { useCase } = buildUseCase(windowRepo);

    const result = await useCase.execute({ windowId: WINDOW_ID });

    expect(result.name).toBe("Ventanilla 1");
    expect(result.type).toBe("cashier");
  });

  it("does not modify isActive", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: WINDOW_ID, isActive: false }),
    ]);
    const { useCase } = buildUseCase(windowRepo);

    const result = await useCase.execute({ windowId: WINDOW_ID, name: "Renombrada" });

    expect(result.isActive).toBe(false);
  });

  it("throws 404 when window does not exist", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ windowId: WINDOW_ID, name: "V1" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_WINDOW_NOT_FOUND" });
  });

  it("throws 400 for invalid windowId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ windowId: "not-a-uuid", name: "V1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for an empty name", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const { useCase } = buildUseCase(windowRepo);

    await expect(
      useCase.execute({ windowId: WINDOW_ID, name: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for an invalid type", async () => {
    const windowRepo = new InMemoryServiceWindowRepo([buildServiceWindow({ id: WINDOW_ID })]);
    const { useCase } = buildUseCase(windowRepo);

    await expect(
      useCase.execute({ windowId: WINDOW_ID, type: "invalid" as never }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
