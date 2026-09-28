import { beforeEach, describe, expect, it, vi } from "vitest";

import { RejectBusinessUseCase } from "../../../src/modules/business/application/RejectBusinessUseCase";
import { InMemoryBusinessRepo, InMemoryUserRepo, buildBusiness, buildUser } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessRejectedEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessRejectedEmail: emailMocks.sendBusinessRejectedEmail,
}));

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID    = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  userRepo?: InMemoryUserRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: "user-1", status: "pending" }),
  ]);
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser({ id: "user-1" })]);
  return { businessRepo, userRepo, useCase: new RejectBusinessUseCase(businessRepo, userRepo) };
};

describe("RejectBusinessUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessRejectedEmail.mockResolvedValue(undefined);
  });

  it("rejects the business and records the reason", async () => {
    const { useCase, businessRepo } = buildUseCase();

    const result = await useCase.execute({
      businessId: BUSINESS_ID,
      rejectedByUserId: ADMIN_ID,
      reason: "Falta documentación",
    });

    expect(result.status).toBe("rejected");
    expect(result.rejectedReason).toBe("Falta documentación");
    expect(result.rejectedAt).toBeInstanceOf(Date);
    expect(businessRepo.all()[0].status).toBe("rejected");
  });

  it("sends the rejection email with the reason", async () => {
    const { useCase } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, rejectedByUserId: ADMIN_ID, reason: "Datos incompletos" });

    expect(emailMocks.sendBusinessRejectedEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
      "Cafe Espera",
      "Datos incompletos",
    );
  });

  describe("errores", () => {
    it("throws 404 when business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 409 when business is not pending", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "approved" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_NOT_PENDING" });
    });

    it("throws 400 for an empty reason", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, rejectedByUserId: ADMIN_ID, reason: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for an invalid businessId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
