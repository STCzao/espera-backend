import { describe, expect, it } from "vitest";

import { computeBusinessCoherenceAlerts } from "../../../src/modules/business/application/businessCoherence";
import { buildBusiness } from "../../helpers/authFakes";
import { buildOrganization } from "../../helpers/organizationFakes";

const CATEGORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CATEGORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("computeBusinessCoherenceAlerts", () => {
  it("returns no alerts when categories match and legalId is set", () => {
    const business = buildBusiness({ categoryId: CATEGORY_ID });
    const organization = buildOrganization({ categoryId: CATEGORY_ID, legalId: "30-1" });

    expect(computeBusinessCoherenceAlerts(business, organization)).toEqual([]);
  });

  it("flags CATEGORY_MISMATCH when the organization declared a different category", () => {
    const business = buildBusiness({ categoryId: CATEGORY_ID });
    const organization = buildOrganization({ categoryId: OTHER_CATEGORY_ID, legalId: "30-1" });

    expect(computeBusinessCoherenceAlerts(business, organization)).toEqual(["CATEGORY_MISMATCH"]);
  });

  it("does not flag a mismatch when the organization has no declared category", () => {
    const business = buildBusiness({ categoryId: CATEGORY_ID });
    const organization = buildOrganization({ categoryId: undefined, legalId: "30-1" });

    expect(computeBusinessCoherenceAlerts(business, organization)).toEqual([]);
  });

  it("flags MISSING_LEGAL_ID when the organization has no legalId", () => {
    const business = buildBusiness({ categoryId: CATEGORY_ID });
    const organization = buildOrganization({ categoryId: CATEGORY_ID, legalId: undefined });

    expect(computeBusinessCoherenceAlerts(business, organization)).toEqual(["MISSING_LEGAL_ID"]);
  });

  it("can flag both alerts at once", () => {
    const business = buildBusiness({ categoryId: CATEGORY_ID });
    const organization = buildOrganization({ categoryId: OTHER_CATEGORY_ID, legalId: undefined });

    expect(computeBusinessCoherenceAlerts(business, organization)).toEqual([
      "CATEGORY_MISMATCH",
      "MISSING_LEGAL_ID",
    ]);
  });
});
