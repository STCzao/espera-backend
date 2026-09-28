import { describe, expect, it } from "vitest";

import { RegenerateBusinessQrCodeUseCase } from "../../../src/modules/business/application/RegenerateBusinessQrCodeUseCase";
import {
  buildBusiness,
  buildBusinessQrCode,
  InMemoryBusinessQrCodeRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
};

describe("RegenerateBusinessQrCodeUseCase", () => {
  it("retires the current QR for 24 hours and creates a new active QR", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        status: "approved",
      }),
    ]);
    const qrCodeRepo = new InMemoryBusinessQrCodeRepo([
      buildBusinessQrCode({
        businessId: validInput.businessId,
        token: "old-token-1234567890",
      }),
    ]);
    const useCase = new RegenerateBusinessQrCodeUseCase(
      businessRepo,
      qrCodeRepo,
    );

    const result = await useCase.execute(validInput);
    const qrCodes = qrCodeRepo.all();

    expect(result).toMatchObject({
      businessId: validInput.businessId,
      status: "active",
      downloadUrl: `/api/business/${validInput.businessId}/qr.png`,
    });
    expect(result.token).not.toBe("old-token-1234567890");
    expect(qrCodes).toHaveLength(2);
    expect(qrCodes.find((qrCode) => qrCode.token === "old-token-1234567890"))
      .toMatchObject({
        status: "retiring",
        validUntil: expect.any(Date),
      });
    const newQrCode = qrCodes.find((qrCode) => qrCode.token === result.token);
    expect(newQrCode).toMatchObject({
      status: "active",
    });
    expect(newQrCode?.validUntil).toBeUndefined();
  });

  describe("errores", () => {
    it("rejects regeneration when the business is not operating", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "rejected",
        }),
      ]);
      const useCase = new RegenerateBusinessQrCodeUseCase(
        businessRepo,
        new InMemoryBusinessQrCodeRepo(),
      );

      await expect(useCase.execute(validInput)).rejects.toMatchObject({
        statusCode: 409,
        code: "BUSINESS_NOT_OPERATING",
      });
    });

    it("throws 404 when the business does not exist", async () => {
      const useCase = new RegenerateBusinessQrCodeUseCase(
        new InMemoryBusinessRepo(),
        new InMemoryBusinessQrCodeRepo(),
      );

      await expect(useCase.execute(validInput)).rejects.toMatchObject({
        statusCode: 404,
        code: "BUSINESS_NOT_FOUND",
      });
    });

    it("throws 403 when the requester does not own the business", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: validInput.businessId, ownerUserId: "someone-else", status: "approved" }),
      ]);
      const useCase = new RegenerateBusinessQrCodeUseCase(
        businessRepo,
        new InMemoryBusinessQrCodeRepo(),
      );

      await expect(useCase.execute(validInput)).rejects.toMatchObject({
        statusCode: 403,
        code: "BUSINESS_OWNERSHIP_REQUIRED",
      });
    });

    it("throws 400 for an invalid businessId", async () => {
      const useCase = new RegenerateBusinessQrCodeUseCase(
        new InMemoryBusinessRepo(),
        new InMemoryBusinessQrCodeRepo(),
      );

      await expect(
        useCase.execute({ ...validInput, businessId: "not-a-uuid" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
