import { describe, expect, it } from "vitest";

import { GetBusinessCategoryConfigUseCase } from "../../../src/modules/business/application/GetBusinessCategoryConfigUseCase";

describe("GetBusinessCategoryConfigUseCase", () => {
  it("returns category-specific attributes for a known category", async () => {
    const useCase = new GetBusinessCategoryConfigUseCase();

    const result = await useCase.execute({
      categoryId: "33333333-3333-4333-8333-333333333333",
    });

    expect(result).toEqual({
      categoryId: "33333333-3333-4333-8333-333333333333",
      attributes: [
        {
          key: "averageServiceMinutes",
          label: "Tiempo promedio por tramite",
          type: "number",
          required: true,
        },
        {
          key: "requiresDocumentation",
          label: "Requiere documentacion",
          type: "boolean",
          required: false,
        },
        {
          key: "serviceArea",
          label: "Area de atencion",
          type: "text",
          required: false,
        },
      ],
    });
  });

  it("returns default attributes for an unknown category", async () => {
    const useCase = new GetBusinessCategoryConfigUseCase();

    const result = await useCase.execute({
      categoryId: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({
      categoryId: "44444444-4444-4444-8444-444444444444",
      attributes: [
        {
          key: "averageServiceMinutes",
          label: "Tiempo promedio por atencion",
          type: "number",
          required: true,
        },
        {
          key: "acceptsWalkIns",
          label: "Acepta personas sin reserva previa",
          type: "boolean",
          required: false,
        },
      ],
    });
  });
});
