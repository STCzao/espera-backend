import { describe, expect, it } from "vitest";

import { ResolveBusinessQrCodeUseCase } from "../../../src/modules/business/application/ResolveBusinessQrCodeUseCase";
import {
  buildBusiness,
  buildBusinessQrCode,
  InMemoryBusinessQrCodeRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

describe("ResolveBusinessQrCodeUseCase", () => {
  it("resolves an active QR token to the business turn flow contract", async () => {
    const business = buildBusiness({
      id: "11111111-1111-4111-8111-111111111111",
      listingStatus: "published",
    });
    const useCase = new ResolveBusinessQrCodeUseCase(
      new InMemoryBusinessRepo([business]),
      new InMemoryBusinessQrCodeRepo([
        buildBusinessQrCode({
          businessId: business.id,
          token: "active-token-1234567890",
        }),
      ]),
    );

    const result = await useCase.execute({
      token: "active-token-1234567890",
    });

    expect(result).toEqual({
      token: "active-token-1234567890",
      qrUrl: "http://localhost:3000/q/active-token-1234567890",
      qrStatus: "active",
      action: "OPEN_BUSINESS_TURN_FLOW",
      appPath: `/business/${business.id}/turns/new`,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        categoryId: business.categoryId,
        address: business.address,
        listingStatus: "published",
        activeServiceWindows: 1,
        operationalStatus: "normal",
      },
    });
  });

  it("keeps a retiring QR token resolvable until its transition window expires", async () => {
    const business = buildBusiness({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const useCase = new ResolveBusinessQrCodeUseCase(
      new InMemoryBusinessRepo([business]),
      new InMemoryBusinessQrCodeRepo([
        buildBusinessQrCode({
          businessId: business.id,
          token: "retiring-token-1234567890",
          status: "retiring",
          validUntil: new Date(Date.now() + 60_000),
        }),
      ]),
    );

    const result = await useCase.execute({
      token: "retiring-token-1234567890",
    });

    expect(result.qrStatus).toBe("retiring");
    expect(result.business.id).toBe(business.id);
  });

  it("rejects expired or revoked QR tokens", async () => {
    const business = buildBusiness({
      id: "11111111-1111-4111-8111-111111111111",
    });
    const useCase = new ResolveBusinessQrCodeUseCase(
      new InMemoryBusinessRepo([business]),
      new InMemoryBusinessQrCodeRepo([
        buildBusinessQrCode({
          businessId: business.id,
          token: "expired-token-1234567890",
          status: "retiring",
          validUntil: new Date(Date.now() - 60_000),
        }),
      ]),
    );

    await expect(
      useCase.execute({ token: "expired-token-1234567890" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "QR_CODE_NOT_FOUND",
    });
  });
});
