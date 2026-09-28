import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IReportRepo } from "../domain/IReportRepo";
import type { Report } from "../domain/Report";
import { PostgresReportRepo } from "../infrastructure/PostgresReportRepo";

const schema = z.object({
  reportId:         z.string().uuid("Invalid report id."),
  reviewedByUserId: z.string().uuid("Invalid reviewer id."),
  note:             z.string().trim().min(1, "A note is required to dismiss a report.").max(500),
});

export type DismissReportInput = z.infer<typeof schema>;

/**
 * Discards a pending report as unfounded (HU-8.6). Reports are never
 * deleted — dismissed ones stay in history (queryable by reportedByUserId
 * via ListReportsUseCase's caller) so repeated spam from the same origin
 * can be spotted later.
 */
export class DismissReportUseCase implements UseCase<DismissReportInput, Report> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
  ) {}

  public async execute(input: DismissReportInput): Promise<Report> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const report = await this.reportRepo.findById(parsed.data.reportId);
    if (!report) throw AppError.notFound("Report not found.", "REPORT_NOT_FOUND");

    if (report.status !== "pending") {
      throw AppError.conflict("Only a pending report can be reviewed.", "REPORT_NOT_PENDING");
    }

    const now = new Date();
    return this.reportRepo.save({
      ...report,
      status: "dismissed",
      reviewedByUserId: parsed.data.reviewedByUserId,
      reviewedAt: now,
      internalNote: parsed.data.note,
      updatedAt: now,
    });
  }
}
