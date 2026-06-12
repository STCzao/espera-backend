import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterBusinessAccountUseCase } from "../../../src/modules/auth/application/RegisterBusinessAccountUseCase";
import {
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendVerificationEmail: emailMocks.sendVerificationEmail,
}));

const validInput = {
  email: "OWNER@example.com",
  password: "Password1",
  firstName: "Owner",
  lastName: "Person",
  businessName: "Cafe Espera",
  businessSlug: "cafe-espera",
  categoryId: "11111111-1111-4111-8111-111111111111",
};

describe("RegisterBusinessAccountUseCase", () => {
  beforeEach(() => {
    emailMocks.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it("creates a pending business admin and its business", async () => {
    const userRepo = new InMemoryUserRepo();
    const businessRepo = new InMemoryBusinessRepo();
    const useCase = new RegisterBusinessAccountUseCase(userRepo, businessRepo);

    const result = await useCase.execute(validInput);

    const createdUser = userRepo.all()[0];
    const createdBusiness = businessRepo.all()[0];
    expect(result).toMatchObject({
      userId: createdUser.id,
      businessId: createdBusiness.id,
      approvalStatus: "pending",
    });
    expect(createdUser).toMatchObject({
      email: "owner@example.com",
      role: "business_admin",
      approvalStatus: "pending",
      isEmailVerified: false,
    });
    expect(createdBusiness).toMatchObject({
      name: "Cafe Espera",
      slug: "cafe-espera",
      ownerUserId: createdUser.id,
    });
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.any(String),
    );
  });

  it("rolls back user and business when verification email fails", async () => {
    emailMocks.sendVerificationEmail.mockRejectedValueOnce(
      new Error("email failed"),
    );
    const userRepo = new InMemoryUserRepo();
    const businessRepo = new InMemoryBusinessRepo();
    const useCase = new RegisterBusinessAccountUseCase(userRepo, businessRepo);

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed to register business account. Please try again.",
    });

    expect(userRepo.all()).toHaveLength(0);
    expect(businessRepo.all()).toHaveLength(0);
    expect(userRepo.deletedIds).toHaveLength(1);
    expect(businessRepo.deletedIds).toHaveLength(1);
  });
});
