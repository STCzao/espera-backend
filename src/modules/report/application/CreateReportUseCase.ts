import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IReportRepo } from "../domain/IReportRepo";
import type { Report } from "../domain/Report";
import { PostgresReportRepo } from "../infrastructure/PostgresReportRepo";

const schema = z.object({
  reportedType:     z.enum(["user", "business"]),
  reportedId:       z.string().uuid("Invalid reported id."),
  reason:           z.string().trim().min(1, "Reason is required.").max(500),
  reportedByUserId: z.string().uuid("Invalid reporter id."),
});

export type CreateReportInput = z.infer<typeof schema>;

/**
 * Files a report against a User or a Business (precondition for HU-8.6 —
 * the backlog has no HU of its own that creates a report, so this is the
 * minimal entry point the Backoffice's review flow needs to be usable).
 */
export class CreateReportUseCase implements UseCase<CreateReportInput, Report> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: CreateReportInput): Promise<Report> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { reportedType, reportedId, reason, reportedByUserId } = parsed.data;

    if (reportedType === "user") {
      if (reportedId === reportedByUserId) {
        throw AppError.badRequest("You cannot report yourself.", "CANNOT_REPORT_SELF");
      }
      const reportedUser = await this.userRepo.findById(reportedId);
      if (!reportedUser) throw AppError.notFound("Reported user not found.", "REPORTED_USER_NOT_FOUND");
    } else {
      const reportedBusiness = await this.businessRepo.findById(reportedId);
      if (!reportedBusiness) throw AppError.notFound("Reported business not found.", "REPORTED_BUSINESS_NOT_FOUND");
    }

    const now = new Date();
    return this.reportRepo.save({
      id: randomUUID(),
      reportedType,
      reportedId,
      reason,
      reportedByUserId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }
}
