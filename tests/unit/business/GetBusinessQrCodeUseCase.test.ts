import { Prisma } from "@prisma/client";
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
        status: "approved",
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
        status: "approved",
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

  describe("carrera entre dos primeras solicitudes concurrentes (red de seguridad de la DB)", () => {
    it("returns the winning QR code instead of erroring on a P2002 from the partial unique index", async () => {
      // Simulates the in-app "no active QR yet" check having raced and
      // lost — both requests saw no active QR, the other request's insert
      // landed first, and the DB's partial unique index (one ACTIVE QR per
      // businessId) rejects this one's insert.
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: validInput.businessId, ownerUserId: validInput.ownerUserId, status: "approved" }),
      ]);
      const qrCodeRepo = new InMemoryBusinessQrCodeRepo();
      const originalSave = qrCodeRepo.save.bind(qrCodeRepo);
      qrCodeRepo.save = async () => {
        // Models the other, faster request's insert landing in the same
        // store right as this one's write is rejected.
        await originalSave(
          buildBusinessQrCode({ businessId: validInput.businessId, token: "winner-token-1234567890" }),
        );
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      };
      const useCase = new GetBusinessQrCodeUseCase(businessRepo, qrCodeRepo);

      const result = await useCase.execute(validInput);

      expect(result.token).toBe("winner-token-1234567890");
    });

    it("rethrows a P2002 unchanged if, somehow, no active QR can be found after it", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: validInput.businessId, ownerUserId: validInput.ownerUserId, status: "approved" }),
      ]);
      const qrCodeRepo = new InMemoryBusinessQrCodeRepo();
      qrCodeRepo.save = async () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      };
      const useCase = new GetBusinessQrCodeUseCase(businessRepo, qrCodeRepo);

      await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it("rethrows an unrelated error from save unchanged", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: validInput.businessId, ownerUserId: validInput.ownerUserId, status: "approved" }),
      ]);
      const qrCodeRepo = new InMemoryBusinessQrCodeRepo();
      const boom = new Error("boom");
      qrCodeRepo.save = async () => { throw boom; };
      const useCase = new GetBusinessQrCodeUseCase(businessRepo, qrCodeRepo);

      await expect(useCase.execute(validInput)).rejects.toBe(boom);
    });
  });

  it("rejects access when the business is not operating", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        status: "pending",
      }),
    ]);
    const useCase = new GetBusinessQrCodeUseCase(
      businessRepo,
      new InMemoryBusinessQrCodeRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_NOT_OPERATING",
    });
  });
});
