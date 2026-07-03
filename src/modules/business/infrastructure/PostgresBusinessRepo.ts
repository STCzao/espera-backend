import { prisma } from "@shared/infrastructure/prisma";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";

const toStatusEnum = (status: Business["status"]) =>
  status.toUpperCase() as "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

const toListingStatusEnum = (listingStatus: Business["listingStatus"]) =>
  listingStatus.toUpperCase() as "DRAFT" | "HIDDEN" | "PUBLISHED";

const toOperationalStatusEnum = (operationalStatus: Business["operationalStatus"]) =>
  operationalStatus.toUpperCase() as "NORMAL" | "DELAYED" | "PAUSED" | "CLOSED";

const toBusiness = (raw: {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  listingStatus: string;
  activeServiceWindows: number;
  operationalStatus: string;
  ownerUserId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}): Business => ({
  id: raw.id,
  name: raw.name,
  slug: raw.slug,
  categoryId: raw.categoryId,
  status: raw.status.toLowerCase() as Business["status"],
  address: raw.address ?? undefined,
  latitude: raw.latitude ?? undefined,
  longitude: raw.longitude ?? undefined,
  listingStatus: raw.listingStatus.toLowerCase() as Business["listingStatus"],
  activeServiceWindows: raw.activeServiceWindows,
  operationalStatus: raw.operationalStatus.toLowerCase() as Business["operationalStatus"],
  ownerUserId: raw.ownerUserId,
  organizationId: raw.organizationId,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresBusinessRepo implements IBusinessRepo {
  public async findById(id: string): Promise<Business | null> {
    const row = await prisma.business.findUnique({ where: { id } });
    return row ? toBusiness(row) : null;
  }

  public async findBySlug(slug: string): Promise<Business | null> {
    const row = await prisma.business.findUnique({ where: { slug } });
    return row ? toBusiness(row) : null;
  }

  public async findByOwnerUserId(ownerUserId: string): Promise<Business[]> {
    const rows = await prisma.business.findMany({ where: { ownerUserId } });
    return rows.map(toBusiness);
  }

  public async save(entity: Business): Promise<Business> {
    const data = {
      name: entity.name,
      slug: entity.slug,
      categoryId: entity.categoryId,
      status: toStatusEnum(entity.status),
      address: entity.address ?? null,
      latitude: entity.latitude ?? null,
      longitude: entity.longitude ?? null,
      listingStatus: toListingStatusEnum(entity.listingStatus),
      activeServiceWindows: entity.activeServiceWindows,
      operationalStatus: toOperationalStatusEnum(entity.operationalStatus),
      ownerUserId: entity.ownerUserId,
      organizationId: entity.organizationId,
    };

    const row = await prisma.business.upsert({
      where: { id: entity.id },
      create: { id: entity.id, ...data },
      update: data,
    });

    return toBusiness(row);
  }

  public async delete(id: string): Promise<void> {
    await prisma.business.delete({ where: { id } });
  }

  public async countByOrganizationId(organizationId: string): Promise<number> {
    return prisma.business.count({ where: { organizationId } });
  }
}
