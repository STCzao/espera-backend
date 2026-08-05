import { describe, expect, it } from "vitest";

import { GetBusinessReviewDetailUseCase } from "../../../src/modules/business/application/GetBusinessReviewDetailUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryOrganizationRepo, buildOrganization } from "../../helpers/organizationFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CATEGORY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  organizationRepo?: InMemoryOrganizationRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID, categoryId: CATEGORY_ID }),
  ]);
  const organizationRepo = options.organizationRepo ?? new InMemoryOrganizationRepo([
    buildOrganization({ id: ORG_ID, categoryId: CATEGORY_ID, legalId: "30-1" }),
  ]);
  return new GetBusinessReviewDetailUseCase(businessRepo, organizationRepo);
};

describe("GetBusinessReviewDetailUseCase", () => {
  it("returns the business alongside its organization's category and legalId", async () => {
    const result = await buildUseCase().execute({ businessId: BUSINESS_ID });

    expect(result.business.id).toBe(BUSINESS_ID);
    expect(result.organization).toMatchObject({ id: ORG_ID, legalId: "30-1", categoryId: CATEGORY_ID });
    expect(result.alerts).toEqual([]);
  });

  it("surfaces a CATEGORY_MISMATCH alert", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, categoryId: OTHER_CATEGORY_ID, legalId: "30-1" }),
    ]);
    const result = await buildUseCase({ organizationRepo }).execute({ businessId: BUSINESS_ID });

    expect(result.alerts).toContain("CATEGORY_MISMATCH");
  });

  it("surfaces a MISSING_LEGAL_ID alert", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, categoryId: CATEGORY_ID }),
    ]);
    const result = await buildUseCase({ organizationRepo }).execute({ businessId: BUSINESS_ID });

    expect(result.alerts).toContain("MISSING_LEGAL_ID");
  });

  describe("errores", () => {
    it("throws 404 when the business does not exist", async () => {
      const useCase = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
