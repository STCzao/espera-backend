import { describe, expect, it } from "vitest";

import { GenerateBusinessQrPngUseCase } from "../../../src/modules/business/application/GenerateBusinessQrPngUseCase";
import { GetBusinessQrCodeUseCase } from "../../../src/modules/business/application/GetBusinessQrCodeUseCase";
import {
  buildBusiness,
  InMemoryBusinessQrCodeRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
};

const buildUseCase = (businessRepo = new InMemoryBusinessRepo([
  buildBusiness({ id: validInput.businessId, ownerUserId: validInput.ownerUserId, status: "approved" }),
])) => new GenerateBusinessQrPngUseCase(
  new GetBusinessQrCodeUseCase(businessRepo, new InMemoryBusinessQrCodeRepo()),
);

describe("GenerateBusinessQrPngUseCase", () => {
  it("generates a PNG buffer named after the business", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(validInput);

    expect(result).toMatchObject({
      fileName: `espera-business-${validInput.businessId}-qr.png`,
      contentType: "image/png",
    });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    // PNG magic bytes — confirms it's an actual encoded image, not just a stub.
    expect(result.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("propagates 404 when the business does not exist", async () => {
    const useCase = buildUseCase(new InMemoryBusinessRepo());

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 404,
      code: "BUSINESS_NOT_FOUND",
    });
  });

  it("propagates 403 when the requester does not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: validInput.businessId, ownerUserId: "someone-else", status: "approved" }),
    ]);
    const useCase = buildUseCase(businessRepo);

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });
});
