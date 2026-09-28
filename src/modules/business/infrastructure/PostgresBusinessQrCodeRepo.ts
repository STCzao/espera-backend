import { BusinessQrCodeStatus as PrismaBusinessQrCodeStatus } from "@prisma/client";

import { prisma } from "@shared/infrastructure/prisma";
import type { BusinessQrCode } from "../domain/BusinessQrCode";
import type { IBusinessQrCodeRepo } from "../domain/IBusinessQrCodeRepo";

const toStatusEnum = (
  status: BusinessQrCode["status"],
): PrismaBusinessQrCodeStatus =>
  status.toUpperCase() as PrismaBusinessQrCodeStatus;

const toDomain = (qrCode: {
  id: string;
  businessId: string;
  token: string;
  status: PrismaBusinessQrCodeStatus;
  validUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BusinessQrCode => ({
  id: qrCode.id,
  businessId: qrCode.businessId,
  token: qrCode.token,
  status: qrCode.status.toLowerCase() as BusinessQrCode["status"],
  validUntil: qrCode.validUntil ?? undefined,
  createdAt: qrCode.createdAt,
  updatedAt: qrCode.updatedAt,
});

export class PostgresBusinessQrCodeRepo implements IBusinessQrCodeRepo {
  public async findById(id: string): Promise<BusinessQrCode | null> {
    const qrCode = await prisma.businessQrCode.findUnique({ where: { id } });
    return qrCode ? toDomain(qrCode) : null;
  }

  public async findActiveByBusinessId(
    businessId: string,
  ): Promise<BusinessQrCode | null> {
    const qrCode = await prisma.businessQrCode.findFirst({
      where: {
        businessId,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return qrCode ? toDomain(qrCode) : null;
  }

  public async findResolvableByToken(
    token: string,
    now: Date,
  ): Promise<BusinessQrCode | null> {
    const qrCode = await prisma.businessQrCode.findFirst({
      where: {
        token,
        OR: [
          { status: "ACTIVE" },
          {
            status: "RETIRING",
            validUntil: {
              gt: now,
            },
          },
        ],
      },
    });

    return qrCode ? toDomain(qrCode) : null;
  }

  public async save(entity: BusinessQrCode): Promise<BusinessQrCode> {
    const qrCode = await prisma.businessQrCode.upsert({
      where: {
        id: entity.id,
      },
      create: {
        id: entity.id,
        businessId: entity.businessId,
        token: entity.token,
        status: toStatusEnum(entity.status),
        validUntil: entity.validUntil ?? null,
      },
      update: {
        businessId: entity.businessId,
        token: entity.token,
        status: toStatusEnum(entity.status),
        validUntil: entity.validUntil ?? null,
      },
    });

    return toDomain(qrCode);
  }

  public async retireActiveForBusiness(
    businessId: string,
    validUntil: Date,
  ): Promise<void> {
    await prisma.businessQrCode.updateMany({
      where: {
        businessId,
        status: "ACTIVE",
      },
      data: {
        status: "RETIRING",
        validUntil,
      },
    });
  }
}
