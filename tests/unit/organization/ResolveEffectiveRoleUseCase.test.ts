import { describe, expect, it } from "vitest";

import { ResolveEffectiveRoleUseCase } from "../../../src/modules/organization/application/ResolveEffectiveRoleUseCase";
import { InMemoryMembershipRepo, buildMembership } from "../../helpers/organizationFakes";

describe("ResolveEffectiveRoleUseCase", () => {
  it("resolves the role from the Membership matching the requested organization", async () => {
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ id: "m1", userId: "user-1", organizationId: "org-a", role: "admin" }),
      buildMembership({ id: "m2", userId: "user-1", organizationId: "org-b", role: "employee" }),
    ]);
    const useCase = new ResolveEffectiveRoleUseCase(membershipRepo);

    const resultA = await useCase.execute({ userId: "user-1", organizationId: "org-a" });
    const resultB = await useCase.execute({ userId: "user-1", organizationId: "org-b" });

    expect(resultA.role).toBe("admin");
    expect(resultB.role).toBe("employee");
  });

  it("returns null when the user has no Membership in the requested organization", async () => {
    const useCase = new ResolveEffectiveRoleUseCase(new InMemoryMembershipRepo());

    const result = await useCase.execute({ userId: "user-1", organizationId: "org-a" });

    expect(result.role).toBeNull();
  });
});
