import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveBusinessAccountUseCase } from "../../../src/modules/auth/application/ApproveBusinessAccountUseCase";
import { buildUser, InMemoryUserRepo } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessWelcomeEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessWelcomeEmail: emailMocks.sendBusinessWelcomeEmail,
}));

describe("ApproveBusinessAccountUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessWelcomeEmail.mockResolvedValue(undefined);
  });

  it("approves a business admin account", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        role: "business_admin",
        approvalStatus: "pending",
      }),
    ]);
    const useCase = new ApproveBusinessAccountUseCase(userRepo);

    const result = await useCase.execute({ userId: "user-1" });
    const updatedUser = await userRepo.findById("user-1");

    expect(result).toEqual({
      userId: "user-1",
      approvalStatus: "approved",
    });
    expect(updatedUser?.approvalStatus).toBe("approved");
    expect(emailMocks.sendBusinessWelcomeEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
    );
  });

  it("rejects non-business-admin accounts", async () => {
    const userRepo = new InMemoryUserRepo([buildUser({ role: "user" })]);
    const useCase = new ApproveBusinessAccountUseCase(userRepo);

    await expect(useCase.execute({ userId: "user-1" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Only business admin accounts can be approved.",
    });
  });
});
