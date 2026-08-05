import { describe, expect, it } from "vitest";

import { UpdateMembershipRoleUseCase } from "../../../src/modules/organization/application/UpdateMembershipRoleUseCase";
import { InMemoryMembershipRepo, buildMembership } from "../../helpers/organizationFakes";

const ORG_ID    = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN2_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMPLOYEE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: { membershipRepo?: InMemoryMembershipRepo } = {}) => {
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo([
    buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
    buildMembership({ id: "m-2", userId: ADMIN2_ID, organizationId: ORG_ID, role: "admin" }),
    buildMembership({ id: "m-3", userId: EMPLOYEE_ID, organizationId: ORG_ID, role: "employee" }),
  ]);
  return { membershipRepo, useCase: new UpdateMembershipRoleUseCase(membershipRepo) };
};

describe("UpdateMembershipRoleUseCase", () => {
  it("promotes an employee to admin", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: EMPLOYEE_ID, role: "admin" });

    expect(result.role).toBe("admin");
  });

  it("demotes an admin to employee when another admin remains", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: ADMIN2_ID, role: "employee" });

    expect(result.role).toBe("employee");
  });

  describe("errores", () => {
    it("throws 403 when the requester is not an active admin", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: EMPLOYEE_ID, userId: ADMIN_ID, role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 404 when the target has no membership", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: "11111111-1111-4111-8111-111111111111", role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "MEMBERSHIP_NOT_FOUND" });
    });

    it("throws 409 when demoting the last active admin (including self)", async () => {
      const membershipRepo = new InMemoryMembershipRepo([
        buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
      ]);
      const { useCase } = buildUseCase({ membershipRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: ADMIN_ID, role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "CANNOT_DEMOTE_LAST_ADMIN" });
    });
  });
});
