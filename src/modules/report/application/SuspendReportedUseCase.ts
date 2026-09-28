import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { BlockUserUseCase } from "@modules/auth/public-api";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo, SuspendBusinessUseCase } from "@modules/business/public-api";
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
 *
 * Suspending/blocking the target and marking the report resolved are two
 * independent actions, not one atomic DB write: SuspendBusinessUseCase and
 * BlockUserUseCase are full use cases with their own side effects (session
 * revocation, turn cancellation) and — for the business path — their own
 * transaction, so this can't just wrap everything in one shared DB
 * transaction without either use case accepting an externally supplied one
 * (which the UseCase<Input, Output> contract doesn't support). Instead, a
 * failure that happens *after* the target was actually suspended/blocked but
 * *before* the report was saved is made retry-safe below: re-running this
 * use case recognizes "already suspended/blocked" as the expected result of
 * a prior attempt and proceeds to close the report, instead of the target's
 * own guard rejecting the retry and leaving the report stuck pending
 * forever.
 */
export class SuspendReportedUseCase implements UseCase<SuspendReportedInput, Report> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
    private readonly suspendBusinessUseCase: SuspendBusinessUseCase = new SuspendBusinessUseCase(),
    private readonly blockUserUseCase: BlockUserUseCase = new BlockUserUseCase(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
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
      try {
        await this.suspendBusinessUseCase.execute({
          businessId: report.reportedId,
          suspendedByUserId: parsed.data.reviewedByUserId,
          reason,
        });
      } catch (error) {
        const business = await this.businessRepo.findById(report.reportedId);
        if (!(error instanceof AppError) || business?.status !== "suspended") {
          throw error;
        }
      }
    } else {
      try {
        await this.blockUserUseCase.execute({
          userId: report.reportedId,
          blockedByUserId: parsed.data.reviewedByUserId,
          reason,
        });
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "USER_ALREADY_BLOCKED") {
          throw error;
        }
      }
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
