import type { FindReportsFilters, IReportRepo } from "../../src/modules/report/domain/IReportRepo";
import type { Report } from "../../src/modules/report/domain/Report";

export const buildReport = (overrides: Partial<Report> = {}): Report => ({
  id: "report-1",
  reportedType: "business",
  reportedId: "business-1",
  reason: "Cobra por turnos que no llegan a atender",
  reportedByUserId: "user-1",
  status: "pending",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export class InMemoryReportRepo implements IReportRepo {
  private readonly reports = new Map<string, Report>();

  public constructor(initialReports: Report[] = []) {
    initialReports.forEach((report) => {
      this.reports.set(report.id, report);
    });
  }

  public async findById(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }

  public async findAll(filters: FindReportsFilters = {}): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((report) => {
        if (filters.status && report.status !== filters.status) return false;
        if (filters.reportedType && report.reportedType !== filters.reportedType) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async findByReportedByUserId(reportedByUserId: string): Promise<Report[]> {
    return [...this.reports.values()].filter((report) => report.reportedByUserId === reportedByUserId);
  }

  public async save(entity: Report): Promise<Report> {
    this.reports.set(entity.id, entity);
    return entity;
  }

  public all(): Report[] {
    return [...this.reports.values()];
  }
}
