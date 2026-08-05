import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IReportRepo } from "../domain/IReportRepo";
import type { Report } from "../domain/Report";
import { PostgresReportRepo } from "../infrastructure/PostgresReportRepo";

const schema = z.object({
  status:       z.enum(["pending", "resolved", "suspended", "dismissed"]).optional(),
  reportedType: z.enum(["user", "business"]).optional(),
});

export type ListReportsInput = z.infer<typeof schema>;

export class ListReportsUseCase implements UseCase<ListReportsInput, Report[]> {
  public constructor(
    private readonly reportRepo: IReportRepo = new PostgresReportRepo(),
  ) {}

  public async execute(input: ListReportsInput): Promise<Report[]> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    return this.reportRepo.findAll(parsed.data);
  }
}
