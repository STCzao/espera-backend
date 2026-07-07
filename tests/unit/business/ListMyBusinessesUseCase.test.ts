import { describe, expect, it } from "vitest";

import { ListMyBusinessesUseCase } from "../../../src/modules/business/application/ListMyBusinessesUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

describe("ListMyBusinessesUseCase", () => {
  it("returns businesses belonging to the owner", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "biz-1", slug: "cafe-espera", ownerUserId: OWNER_ID, status: "approved" }),
      buildBusiness({ id: "biz-2", slug: "bar-espera", ownerUserId: OWNER_ID, status: "pending" }),
    ]);
    const useCase = new ListMyBusinessesUseCase(businessRepo);

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses).toHaveLength(2);
    expect(result.businesses[0]).toMatchObject({
      slug: "cafe-espera",
      status: "approved",
    });
    expect(result.businesses[1]).toMatchObject({
      slug: "bar-espera",
      status: "pending",
    });
  });

  it("does not expose internal ids", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ ownerUserId: OWNER_ID }),
    ]);
    const useCase = new ListMyBusinessesUseCase(businessRepo);

    const result = await useCase.execute({ ownerUserId: OWNER_ID });
    const business = result.businesses[0] as Record<string, unknown>;

    expect(business).not.toHaveProperty("id");
    expect(business).not.toHaveProperty("organizationId");
  });

  it("returns empty array when owner has no businesses", async () => {
    const useCase = new ListMyBusinessesUseCase(new InMemoryBusinessRepo());

    const result = await useCase.execute({ ownerUserId: OWNER_ID });

    expect(result.businesses).toHaveLength(0);
  });
});
