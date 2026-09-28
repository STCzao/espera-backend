import type { Report as PrismaReport } from "@prisma/client";

import { prisma } from "@shared/infrastructure/prisma";
import type { FindReportsFilters, IReportRepo } from "../domain/IReportRepo";
import type { Report, ReportedEntityType, ReportStatus } from "../domain/Report";

const toReportedTypeEnum = (reportedType: ReportedEntityType) =>
  reportedType.toUpperCase() as "USER" | "BUSINESS";

const toStatusEnum = (status: ReportStatus) =>
  status.toUpperCase() as "PENDING" | "RESOLVED" | "SUSPENDED" | "DISMISSED";

const toReport = (raw: PrismaReport): Report => ({
  id: raw.id,
  reportedType: raw.reportedType.toLowerCase() as ReportedEntityType,
  reportedId: raw.reportedId,
  reason: raw.reason,
  reportedByUserId: raw.reportedByUserId,
  status: raw.status.toLowerCase() as ReportStatus,
  internalNote: raw.internalNote ?? undefined,
  reviewedByUserId: raw.reviewedByUserId ?? undefined,
  reviewedAt: raw.reviewedAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresReportRepo implements IReportRepo {
  public async findById(id: string): Promise<Report | null> {
    const row = await prisma.report.findUnique({ where: { id } });
    return row ? toReport(row) : null;
  }

  public async findAll(filters: FindReportsFilters = {}): Promise<Report[]> {
    const rows = await prisma.report.findMany({
      where: {
        status: filters.status ? toStatusEnum(filters.status) : undefined,
        reportedType: filters.reportedType ? toReportedTypeEnum(filters.reportedType) : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toReport);
  }

  public async findByReportedByUserId(reportedByUserId: string): Promise<Report[]> {
    const rows = await prisma.report.findMany({
      where: { reportedByUserId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toReport);
  }

  public async save(entity: Report): Promise<Report> {
    const data = {
      reportedType: toReportedTypeEnum(entity.reportedType),
      reportedId: entity.reportedId,
      reason: entity.reason,
      reportedByUserId: entity.reportedByUserId,
      status: toStatusEnum(entity.status),
      internalNote: entity.internalNote ?? null,
      reviewedByUserId: entity.reviewedByUserId ?? null,
      reviewedAt: entity.reviewedAt ?? null,
    };

    const row = await prisma.report.upsert({
      where: { id: entity.id },
      create: { id: entity.id, ...data },
      update: data,
    });

    return toReport(row);
  }
}
