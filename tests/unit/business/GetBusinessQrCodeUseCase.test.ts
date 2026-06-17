import { describe, expect, it } from "vitest";

import { GetBusinessQrCodeUseCase } from "../../../src/modules/business/application/GetBusinessQrCodeUseCase";
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

describe("GetBusinessQrCodeUseCase", () => {
  it("creates an active QR code when the business does not have one", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
      }),
    ]);
    const qrCodeRepo = new InMemoryBusinessQrCodeRepo();
    const useCase = new GetBusinessQrCodeUseCase(businessRepo, qrCodeRepo);

    const result = await useCase.execute(validInput);

    expect(result).toMatchObject({
      businessId: validInput.businessId,
      qrUrl: expect.stringContaining("/q/"),
      downloadUrl: `/api/business/${validInput.businessId}/qr.png`,
      status: "active",
    });
    expect(result.token).toEqual(expect.any(String));
    expect(qrCodeRepo.all()).toHaveLength(1);
  });

  it("returns the current active QR code without regenerating it", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
      }),
    ]);
    const qrCodeRepo = new InMemoryBusinessQrCodeRepo([
      buildBusinessQrCode({
        businessId: validInput.businessId,
        token: "existing-token-1234567890",
      }),
    ]);
    const useCase = new GetBusinessQrCodeUseCase(businessRepo, qrCodeRepo);

    const result = await useCase.execute(validInput);

    expect(result.token).toBe("existing-token-1234567890");
    expect(qrCodeRepo.all()).toHaveLength(1);
  });

  it("rejects access from users that do not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: "33333333-3333-4333-8333-333333333333",
      }),
    ]);
    const useCase = new GetBusinessQrCodeUseCase(
      businessRepo,
      new InMemoryBusinessQrCodeRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });
});
