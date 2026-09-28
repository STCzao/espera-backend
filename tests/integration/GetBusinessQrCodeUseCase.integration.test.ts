import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GetBusinessQrCodeUseCase } from "../../src/modules/business/application/GetBusinessQrCodeUseCase";
import { PostgresBusinessQrCodeRepo } from "../../src/modules/business/infrastructure/PostgresBusinessQrCodeRepo";
import { PostgresBusinessRepo } from "../../src/modules/business/infrastructure/PostgresBusinessRepo";
import { prisma } from "../../src/shared/infrastructure/prisma";

/**
 * Proves the partial unique index (migration
 * 20260918000000_unique_active_qr_per_business) actually closes the race
 * against real Postgres: two truly concurrent first-time requests must
 * settle on the same single ACTIVE QR code, never two.
 */
describe("GetBusinessQrCodeUseCase (real Postgres unique index)", () => {
  const ownerId = randomUUID();
  const categoryId = randomUUID();
  const organizationId = randomUUID();
  const businessId = randomUUID();

  const useCase = new GetBusinessQrCodeUseCase(
    new PostgresBusinessRepo(),
    new PostgresBusinessQrCodeRepo(),
  );

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: ownerId, email: `integration-qr-owner-${ownerId}@example.com`, firstName: "QR", lastName: "Owner" },
    });
    await prisma.businessCategory.create({
      data: { id: categoryId, name: "Integration QR Category", slug: `integration-qr-category-${categoryId}` },
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Integration QR Org" },
    });
    await prisma.business.create({
      data: {
        id: businessId,
        name: "Integration QR Business",
        slug: `integration-qr-business-${businessId}`,
        categoryId,
        ownerUserId: ownerId,
        organizationId,
        status: "APPROVED",
      },
    });
  });

  afterAll(async () => {
    await prisma.businessQrCode.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.businessCategory.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("settles on a single ACTIVE QR code for two truly concurrent first-time requests", async () => {
    const [resultA, resultB] = await Promise.all([
      useCase.execute({ businessId, ownerUserId: ownerId }),
      useCase.execute({ businessId, ownerUserId: ownerId }),
    ]);

    expect(resultA.token).toBe(resultB.token);

    const activeQrCodes = await prisma.businessQrCode.findMany({
      where: { businessId, status: "ACTIVE" },
    });
    expect(activeQrCodes).toHaveLength(1);
  });
});
