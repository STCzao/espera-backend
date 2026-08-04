import { describe, expect, it } from "vitest";

import { ApproveBusinessAccountUseCase } from "../../../src/modules/auth/application/ApproveBusinessAccountUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const buildUseCase = (options: { userRepo?: InMemoryUserRepo } = {}) => {
  const userRepo = options.userRepo ?? new InMemoryUserRepo([
    buildUser({ role: "business_admin", approvalStatus: "pending" }),
  ]);
  return { userRepo, useCase: new ApproveBusinessAccountUseCase(userRepo) };
};

describe("ApproveBusinessAccountUseCase", () => {
  it("sets user approvalStatus to approved", async () => {
    const { useCase, userRepo } = buildUseCase();

    const result = await useCase.execute({ userId: "user-1" });

    expect(result).toEqual({ userId: "user-1", approvalStatus: "approved" });
    expect((await userRepo.findById("user-1"))?.approvalStatus).toBe("approved");
  });

  it("marks email as verified so the user can login even if they never clicked the link", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ role: "business_admin", approvalStatus: "pending", isEmailVerified: false }),
    ]);
    const { useCase } = buildUseCase({ userRepo });

    await useCase.execute({ userId: "user-1" });

    expect((await userRepo.findById("user-1"))?.isEmailVerified).toBe(true);
  });

  it("does not touch any Business or Subscription (decoupled from commercial approval)", async () => {
    // This use case only gates account/login status (User.approvalStatus).
    // Organization and Business approval are handled by
    // ApproveOrganizationUseCase / ApproveBusinessUseCase respectively.
    const { useCase, userRepo } = buildUseCase();

    await useCase.execute({ userId: "user-1" });

    expect((await userRepo.findById("user-1"))?.approvalStatus).toBe("approved");
  });

  it("rejects non-business-admin accounts", async () => {
    const { useCase } = buildUseCase({
      userRepo: new InMemoryUserRepo([buildUser({ role: "user" })]),
    });

    await expect(useCase.execute({ userId: "user-1" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Only business admin accounts can be approved.",
    });
  });

  it("throws 404 when user does not exist", async () => {
    const { useCase } = buildUseCase({ userRepo: new InMemoryUserRepo() });

    await expect(useCase.execute({ userId: "user-1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
