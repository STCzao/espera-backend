import type { Repository } from "../../../shared/kernel/Repository";
import type { Report, ReportedEntityType, ReportStatus } from "./Report";

export interface FindReportsFilters {
  status?: ReportStatus;
  reportedType?: ReportedEntityType;
}

export interface IReportRepo extends Repository<Report> {
  findAll(filters?: FindReportsFilters): Promise<Report[]>;
  findByReportedByUserId(reportedByUserId: string): Promise<Report[]>;
}
