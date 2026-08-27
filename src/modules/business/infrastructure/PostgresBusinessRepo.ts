import { prisma } from "@shared/infrastructure/prisma";
import type { Business } from "../domain/Business";
import type { FindManyBusinessesFilters, FindPendingBusinessesFilters, IBusinessRepo } from "../domain/IBusinessRepo";

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
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  rejectedAt: Date | null;
  suspendedByUserId: string | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  reactivatedByUserId: string | null;
  reactivatedAt: Date | null;
  approvalNote: string | null;
  approvalAlertsSnapshot: string[];
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  listingStatus: string;
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
  approvedByUserId: raw.approvedByUserId ?? undefined,
  approvedAt: raw.approvedAt ?? undefined,
  rejectedReason: raw.rejectedReason ?? undefined,
  rejectedAt: raw.rejectedAt ?? undefined,
  suspendedByUserId: raw.suspendedByUserId ?? undefined,
  suspendedAt: raw.suspendedAt ?? undefined,
  suspensionReason: raw.suspensionReason ?? undefined,
  reactivatedByUserId: raw.reactivatedByUserId ?? undefined,
  reactivatedAt: raw.reactivatedAt ?? undefined,
  approvalNote: raw.approvalNote ?? undefined,
  approvalAlertsSnapshot: raw.approvalAlertsSnapshot,
  phone: raw.phone ?? undefined,
  address: raw.address ?? undefined,
  latitude: raw.latitude ?? undefined,
  longitude: raw.longitude ?? undefined,
  listingStatus: raw.listingStatus.toLowerCase() as Business["listingStatus"],
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

  public async findByOrganizationId(organizationId: string): Promise<Business[]> {
    const rows = await prisma.business.findMany({ where: { organizationId } });
    return rows.map(toBusiness);
  }

  public async findPending(filters: FindPendingBusinessesFilters = {}): Promise<Business[]> {
    const rows = await prisma.business.findMany({
      where: {
        status: "PENDING",
        organizationId: filters.organizationId,
        categoryId: filters.categoryId,
        createdAt: (filters.fromDate || filters.toDate)
          ? { gte: filters.fromDate, lte: filters.toDate }
          : undefined,
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toBusiness);
  }

  public async findMany(filters: FindManyBusinessesFilters = {}): Promise<Business[]> {
    const rows = await prisma.business.findMany({
      where: {
        organizationId: filters.organizationId,
        categoryId: filters.categoryId,
        status: filters.status ? toStatusEnum(filters.status) : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toBusiness);
  }

  public async save(entity: Business): Promise<Business> {
    const data = {
      name: entity.name,
      slug: entity.slug,
      categoryId: entity.categoryId,
      status: toStatusEnum(entity.status),
      approvedByUserId: entity.approvedByUserId ?? null,
      approvedAt: entity.approvedAt ?? null,
      rejectedReason: entity.rejectedReason ?? null,
      rejectedAt: entity.rejectedAt ?? null,
      suspendedByUserId: entity.suspendedByUserId ?? null,
      suspendedAt: entity.suspendedAt ?? null,
      suspensionReason: entity.suspensionReason ?? null,
      reactivatedByUserId: entity.reactivatedByUserId ?? null,
      reactivatedAt: entity.reactivatedAt ?? null,
      approvalNote: entity.approvalNote ?? null,
      approvalAlertsSnapshot: entity.approvalAlertsSnapshot ?? [],
      phone: entity.phone ?? null,
      address: entity.address ?? null,
      latitude: entity.latitude ?? null,
      longitude: entity.longitude ?? null,
      listingStatus: toListingStatusEnum(entity.listingStatus),
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
    // Used exclusively to enforce PLAN_LIMITS.maxBusinesses (RegisterBusinessUseCase,
    // OrganizationController.changeSubscriptionPlan) — a "rejected" Business never
    // consumed a real operating slot and shouldn't count against the plan forever.
    // "pending"/"suspended" do count: both represent a real Business that either
    // is or was operating (suspended can be reactivated by the platform team).
    return prisma.business.count({ where: { organizationId, status: { not: "REJECTED" } } });
  }

  public async countByStatus(status: Business["status"]): Promise<number> {
    return prisma.business.count({ where: { status: toStatusEnum(status) } });
  }
}
