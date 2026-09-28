import { describe, expect, it } from "vitest";

import { ReactivateBusinessUseCase } from "../../../src/modules/business/application/ReactivateBusinessUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (businessRepo = new InMemoryBusinessRepo([
  buildBusiness({ id: BUSINESS_ID, status: "suspended", suspensionReason: "Fraude", suspendedAt: new Date("2026-01-01T00:00:00Z") }),
])) => ({ businessRepo, useCase: new ReactivateBusinessUseCase(businessRepo) });

describe("ReactivateBusinessUseCase", () => {
  it("reactivates a suspended business back to approved", async () => {
    const { useCase, businessRepo } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, reactivatedByUserId: ADMIN_ID });

    expect(result.status).toBe("approved");
    expect(result.reactivatedByUserId).toBe(ADMIN_ID);
    expect(result.reactivatedAt).toBeInstanceOf(Date);
    expect(businessRepo.all()[0].status).toBe("approved");
  });

  it("keeps the suspension history for audit purposes", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, reactivatedByUserId: ADMIN_ID });

    expect(result.suspensionReason).toBe("Fraude");
    expect(result.suspendedAt).toBeInstanceOf(Date);
  });

  describe("errores", () => {
    it("throws 404 when business does not exist", async () => {
      const { useCase } = buildUseCase(new InMemoryBusinessRepo());

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, reactivatedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 409 when business is not suspended", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, status: "approved" }),
      ]);
      const { useCase } = buildUseCase(businessRepo);

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, reactivatedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_NOT_SUSPENDED" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", reactivatedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
