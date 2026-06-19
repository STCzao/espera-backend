import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveBusinessUseCase } from "../../../src/modules/business/application/ApproveBusinessUseCase";
import {
  buildBusiness,
  buildUser,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessWelcomeEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessWelcomeEmail: emailMocks.sendBusinessWelcomeEmail,
}));

describe("ApproveBusinessUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessWelcomeEmail.mockReset();
    emailMocks.sendBusinessWelcomeEmail.mockResolvedValue(undefined);
  });

  it("approves only the selected business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "business-1", approvalStatus: "pending" }),
      buildBusiness({
        id: "business-2",
        slug: "second-business",
        approvalStatus: "pending",
      }),
    ]);
    const userRepo = new InMemoryUserRepo([buildUser()]);
    const useCase = new ApproveBusinessUseCase(businessRepo, userRepo);

    const result = await useCase.execute({ businessId: "business-1" });

    expect(result).toEqual({
      businessId: "business-1",
      approvalStatus: "approved",
    });
    expect((await businessRepo.findById("business-1"))?.approvalStatus).toBe(
      "approved",
    );
    expect((await businessRepo.findById("business-2"))?.approvalStatus).toBe(
      "pending",
    );
    expect(emailMocks.sendBusinessWelcomeEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
    );
  });

  it("rejects unknown businesses", async () => {
    const useCase = new ApproveBusinessUseCase(
      new InMemoryBusinessRepo(),
      new InMemoryUserRepo(),
    );

    await expect(
      useCase.execute({ businessId: "missing-business" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BUSINESS_NOT_FOUND",
    });
  });
});
