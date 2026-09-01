import { describe, expect, it } from "vitest";

import { GetBusinessCategoriesUseCase } from "../../../src/modules/business/application/GetBusinessCategoriesUseCase";
import { buildBusinessCategory, InMemoryBusinessCategoryRepo } from "../../helpers/authFakes";

describe("GetBusinessCategoriesUseCase", () => {
  it("returns every category from the repository", async () => {
    const categoryRepo = new InMemoryBusinessCategoryRepo([
      buildBusinessCategory({ id: "cat-1", name: "Cafetería", slug: "cafeteria" }),
      buildBusinessCategory({ id: "cat-2", name: "Peluquería", slug: "peluqueria" }),
    ]);
    const useCase = new GetBusinessCategoriesUseCase(categoryRepo);

    const result = await useCase.execute();

    expect(result.categories).toHaveLength(2);
    expect(result.categories.map((c) => c.slug).sort()).toEqual(["cafeteria", "peluqueria"]);
  });

  it("returns an empty array when there are no categories", async () => {
    const useCase = new GetBusinessCategoriesUseCase(new InMemoryBusinessCategoryRepo([]));

    const result = await useCase.execute();

    expect(result).toEqual({ categories: [] });
  });
});
