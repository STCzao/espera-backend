import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IReportRepo } from "../domain/IReportRepo";
import type { Report } from "../domain/Report";
import { PostgresReportRepo } from "../infrastructure/PostgresReportRepo";

const schema = z.object({
  reportId:         z.string().uuid("Invalid report id."),
  reviewedByUserId: z.string().uuid("Invalid reviewer id."),
  note:             z.string().trim().max(500).optional(),
});

export type ResolveReportInput = z.infer<typeof schema>;

/**
 * Marks a pending report as resolved without suspending the reported
 * User/Business — used when the review concludes no action is warranted
 * beyond having looked into it (e.g. a warning was given outside the system).
 */
export class ResolveReportUseCase implements UseCase<ResolveReportInput, Report> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
  ) {}

  public async execute(input: ResolveReportInput): Promise<Report> {
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
      status: "resolved",
      reviewedByUserId: parsed.data.reviewedByUserId,
      reviewedAt: now,
      internalNote: parsed.data.note,
      updatedAt: now,
    });
  }
}
