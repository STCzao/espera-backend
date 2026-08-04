import { prisma } from "@shared/infrastructure/prisma";
import type { IOrganizationRepo } from "../domain/IOrganizationRepo";
import type { Organization, OrganizationStatus } from "../domain/Organization";

const toStatusEnum = (status: OrganizationStatus) =>
  status.toUpperCase() as "PENDING" | "APPROVED" | "REJECTED";

const toOrganization = (raw: {
  id: string;
  name: string;
  legalId: string | null;
  status: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Organization => ({
  id: raw.id,
  name: raw.name,
  legalId: raw.legalId ?? undefined,
  status: raw.status.toLowerCase() as OrganizationStatus,
  approvedByUserId: raw.approvedByUserId ?? undefined,
  approvedAt: raw.approvedAt ?? undefined,
  rejectedReason: raw.rejectedReason ?? undefined,
  rejectedAt: raw.rejectedAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresOrganizationRepo implements IOrganizationRepo {
  public async findById(id: string): Promise<Organization | null> {
    const row = await prisma.organization.findUnique({ where: { id } });
    return row ? toOrganization(row) : null;
  }

  public async findPending(): Promise<Organization[]> {
    const rows = await prisma.organization.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toOrganization);
  }

  public async save(entity: Organization): Promise<Organization> {
    const data = {
      name:             entity.name,
      legalId:          entity.legalId ?? null,
      status:           toStatusEnum(entity.status),
      approvedByUserId: entity.approvedByUserId ?? null,
      approvedAt:       entity.approvedAt ?? null,
      rejectedReason:   entity.rejectedReason ?? null,
      rejectedAt:       entity.rejectedAt ?? null,
    };

    const row = await prisma.organization.upsert({
      where: { id: entity.id },
      create: { id: entity.id, ...data },
      update: data,
    });

    return toOrganization(row);
  }
}
