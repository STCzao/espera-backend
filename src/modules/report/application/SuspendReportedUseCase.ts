import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { BlockUserUseCase } from "@modules/auth/public-api";
import { SuspendBusinessUseCase } from "@modules/business/public-api";
import type { IReportRepo } from "../domain/IReportRepo";
import type { Report } from "../domain/Report";
import { PostgresReportRepo } from "../infrastructure/PostgresReportRepo";

const schema = z.object({
  reportId:         z.string().uuid("Invalid report id."),
  reviewedByUserId: z.string().uuid("Invalid reviewer id."),
  note:             z.string().trim().max(500).optional(),
});

export type SuspendReportedInput = z.infer<typeof schema>;

/**
 * Suspends whoever was reported (HU-8.6): delegates to the existing
 * SuspendBusinessUseCase (HU-8.4) when the report targets a Business, or to
 * BlockUserUseCase when it targets a User, then marks the report itself as
 * "suspended". If the target can't actually be suspended right now (e.g. a
 * Business that's still pending approval), the whole action fails and the
 * report stays pending — reviewers should not see "suspended" unless the
 * suspension genuinely happened.
 */
export class SuspendReportedUseCase implements UseCase<SuspendReportedInput, Report> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
    private readonly suspendBusinessUseCase: SuspendBusinessUseCase = new SuspendBusinessUseCase(),
    private readonly blockUserUseCase: BlockUserUseCase = new BlockUserUseCase(),
  ) {}

  public async execute(input: SuspendReportedInput): Promise<Report> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const report = await this.reportRepo.findById(parsed.data.reportId);
    if (!report) throw AppError.notFound("Report not found.", "REPORT_NOT_FOUND");

    if (report.status !== "pending") {
      throw AppError.conflict("Only a pending report can be reviewed.", "REPORT_NOT_PENDING");
    }

    const reason = parsed.data.note ?? report.reason;

    if (report.reportedType === "business") {
      await this.suspendBusinessUseCase.execute({
        businessId: report.reportedId,
        suspendedByUserId: parsed.data.reviewedByUserId,
        reason,
      });
    } else {
      await this.blockUserUseCase.execute({
        userId: report.reportedId,
        blockedByUserId: parsed.data.reviewedByUserId,
        reason,
      });
    }

    const now = new Date();
    return this.reportRepo.save({
      ...report,
      status: "suspended",
      reviewedByUserId: parsed.data.reviewedByUserId,
      reviewedAt: now,
      internalNote: parsed.data.note,
      updatedAt: now,
    });
  }
}
