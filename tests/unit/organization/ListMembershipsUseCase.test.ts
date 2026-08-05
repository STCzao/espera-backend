import { describe, expect, it } from "vitest";

import { ListMembershipsUseCase } from "../../../src/modules/organization/application/ListMembershipsUseCase";
import { InMemoryMembershipRepo, buildMembership } from "../../helpers/organizationFakes";

const ORG_ID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OUTSIDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("ListMembershipsUseCase", () => {
  it("lists active members for the organization", async () => {
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
      buildMembership({ id: "m-2", userId: "employee-1", organizationId: ORG_ID, role: "employee" }),
      buildMembership({ id: "m-3", userId: "revoked-1", organizationId: ORG_ID, role: "employee", status: "revoked" }),
    ]);
    const useCase = new ListMembershipsUseCase(membershipRepo);

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID });

    expect(result.memberships).toHaveLength(2);
    expect(result.memberships.map((m) => m.userId).sort()).toEqual(["employee-1", ADMIN_ID].sort());
  });

  it("allows a non-admin active member to list too", async () => {
    const employeeId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ id: "m-1", userId: employeeId, organizationId: ORG_ID, role: "employee" }),
    ]);
    const useCase = new ListMembershipsUseCase(membershipRepo);

    await expect(
      useCase.execute({ organizationId: ORG_ID, requestingUserId: employeeId }),
    ).resolves.toMatchObject({ organizationId: ORG_ID });
  });

  it("throws 403 when the requester has no active membership", async () => {
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
    ]);
    const useCase = new ListMembershipsUseCase(membershipRepo);

    await expect(
      useCase.execute({ organizationId: ORG_ID, requestingUserId: OUTSIDER_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
  });
});
