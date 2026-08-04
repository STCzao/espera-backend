import { describe, expect, it } from "vitest";

import { ListPendingOrganizationsUseCase } from "../../../src/modules/organization/application/ListPendingOrganizationsUseCase";
import { InMemoryOrganizationRepo, buildOrganization } from "../../helpers/organizationFakes";

describe("ListPendingOrganizationsUseCase", () => {
  it("returns only pending organizations", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: "o-1", status: "pending" }),
      buildOrganization({ id: "o-2", status: "approved" }),
      buildOrganization({ id: "o-3", status: "rejected" }),
    ]);
    const useCase = new ListPendingOrganizationsUseCase(organizationRepo);

    const result = await useCase.execute();

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].id).toBe("o-1");
  });

  it("returns an empty array when there are no pending organizations", async () => {
    const useCase = new ListPendingOrganizationsUseCase(new InMemoryOrganizationRepo());

    const result = await useCase.execute();

    expect(result.organizations).toEqual([]);
  });
});
