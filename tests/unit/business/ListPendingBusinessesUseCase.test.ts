import { describe, expect, it } from "vitest";

import { ListPendingBusinessesUseCase } from "../../../src/modules/business/application/ListPendingBusinessesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAT_A = "11111111-1111-4111-8111-111111111111";
const CAT_B = "22222222-2222-4222-8222-222222222222";

const buildUseCase = (businessRepo = new InMemoryBusinessRepo()) =>
  ({ useCase: new ListPendingBusinessesUseCase(businessRepo), businessRepo });

describe("ListPendingBusinessesUseCase", () => {
  it("returns only pending businesses", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "b-1", status: "pending" }),
      buildBusiness({ id: "b-2", slug: "b-2", status: "approved" }),
      buildBusiness({ id: "b-3", slug: "b-3", status: "rejected" }),
    ]);
    const { useCase } = buildUseCase(businessRepo);

    const result = await useCase.execute({});

    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0].id).toBe("b-1");
  });

  it("filters by organizationId", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "b-1", slug: "b-1", status: "pending", organizationId: ORG_A }),
      buildBusiness({ id: "b-2", slug: "b-2", status: "pending", organizationId: ORG_B }),
    ]);
    const { useCase } = buildUseCase(businessRepo);

    const result = await useCase.execute({ organizationId: ORG_A });

    expect(result.businesses.map((b) => b.id)).toEqual(["b-1"]);
  });

  it("filters by categoryId", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "b-1", slug: "b-1", status: "pending", categoryId: CAT_A }),
      buildBusiness({ id: "b-2", slug: "b-2", status: "pending", categoryId: CAT_B }),
    ]);
    const { useCase } = buildUseCase(businessRepo);

    const result = await useCase.execute({ categoryId: CAT_B });

    expect(result.businesses.map((b) => b.id)).toEqual(["b-2"]);
  });

  it("filters by date range", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "b-old", slug: "b-old", status: "pending", createdAt: new Date("2026-01-01T00:00:00Z") }),
      buildBusiness({ id: "b-new", slug: "b-new", status: "pending", createdAt: new Date("2026-02-01T00:00:00Z") }),
    ]);
    const { useCase } = buildUseCase(businessRepo);

    const result = await useCase.execute({ fromDate: "2026-01-15", toDate: "2026-02-15" });

    expect(result.businesses.map((b) => b.id)).toEqual(["b-new"]);
  });

  it("returns empty array when there are no pending businesses", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({});

    expect(result.businesses).toEqual([]);
  });

  it("throws 400 for an invalid organizationId filter", async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ organizationId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
