import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { todayUTC } from "@shared/utils/date";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { ITurnRepo } from "@modules/queue/public-api";
import { PostgresTurnRepo } from "@modules/queue/public-api";
import type { IBusinessCategoryRepo } from "../domain/IBusinessCategoryRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessCategoryRepo } from "../infrastructure/PostgresBusinessCategoryRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TOP_N = 5;
const WEEK_DAYS = 7;

const schema = z.object({
  fromDate: z.string().regex(DATE_REGEX, "fromDate must be in YYYY-MM-DD format.").optional(),
  toDate:   z.string().regex(DATE_REGEX, "toDate must be in YYYY-MM-DD format.").optional(),
});

export type GetPlatformMetricsInput = z.infer<typeof schema>;

export interface TopBusinessMetric {
  businessId: string;
  businessName: string;
  turnCount: number;
}

export interface TopCategoryMetric {
  categoryId: string;
  categoryName: string;
  turnCount: number;
}

export interface GetPlatformMetricsOutput {
  totalActiveBusinesses: number;
  totalRegisteredUsers: number;
  turnsToday: number;
  turnsThisWeek: number;
  range: {
    fromDate: string;
    toDate: string;
    totalTurns: number;
    cancelledTurns: number;
    cancellationRate: number;
    topBusinesses: TopBusinessMetric[];
    topCategories: TopCategoryMetric[];
  };
}

const parseUTCDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const toDateStr = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Platform-wide aggregate metrics for the Backoffice dashboard (HU-8.5).
 * Deliberately scoped to activity/date-range concerns only — browsing or
 * filtering the actual business directory (independent of whether a
 * business had any turns in a given window) lives in
 * ListAllBusinessesUseCase instead. The two got conflated in an earlier
 * pass (this endpoint grew filters/pagination/subscription info on
 * `topBusinesses`), which silently hid any business with zero turns in the
 * selected range from that list — a real bug for anyone trying to browse
 * businesses by status/plan rather than by activity. Split back apart.
 */
export class GetPlatformMetricsUseCase
  implements UseCase<GetPlatformMetricsInput, GetPlatformMetricsOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly categoryRepo: IBusinessCategoryRepo = new PostgresBusinessCategoryRepo(),
  ) {}

  public async execute(input: GetPlatformMetricsInput): Promise<GetPlatformMetricsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const today = todayUTC();
    const sevenDaysAgo = new Date(today.getTime() - (WEEK_DAYS - 1) * 24 * 60 * 60 * 1000);
    const fromDate = parsed.data.fromDate ? parseUTCDate(parsed.data.fromDate) : sevenDaysAgo;
    const toDate = parsed.data.toDate ? parseUTCDate(parsed.data.toDate) : today;

    const [
      totalActiveBusinesses,
      totalRegisteredUsers,
      turnsTodayRows,
      turnsWeekRows,
      rangeCounts,
      rangeRows,
    ] = await Promise.all([
      this.businessRepo.countByStatus("approved"),
      this.userRepo.count(),
      this.turnRepo.getTurnCountsByBusiness(today, today),
      this.turnRepo.getTurnCountsByBusiness(sevenDaysAgo, today),
      this.turnRepo.getPlatformTurnCounts(fromDate, toDate),
      this.turnRepo.getTurnCountsByBusiness(fromDate, toDate),
    ]);

    const sum = (rows: Array<{ turnCount: number }>) => rows.reduce((acc, r) => acc + r.turnCount, 0);
    const totalResolved = rangeCounts.completed + rangeCounts.cancelled;
    const cancellationRate = totalResolved > 0
      ? Math.round((rangeCounts.cancelled / totalResolved) * 1000) / 10
      : 0;

    const topBusinessRows = rangeRows.slice(0, TOP_N);
    const topBusinesses: TopBusinessMetric[] = [];
    for (const row of topBusinessRows) {
      const business = await this.businessRepo.findById(row.businessId);
      topBusinesses.push({
        businessId: row.businessId,
        businessName: business?.name ?? "Unknown business",
        turnCount: row.turnCount,
      });
    }

    const turnCountByCategory = new Map<string, number>();
    for (const row of rangeRows) {
      const business = await this.businessRepo.findById(row.businessId);
      if (!business) continue;
      turnCountByCategory.set(
        business.categoryId,
        (turnCountByCategory.get(business.categoryId) ?? 0) + row.turnCount,
      );
    }

    const topCategoryEntries = [...turnCountByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N);
    const topCategories: TopCategoryMetric[] = [];
    for (const [categoryId, turnCount] of topCategoryEntries) {
      const category = await this.categoryRepo.findById(categoryId);
      topCategories.push({
        categoryId,
        categoryName: category?.name ?? "Unknown category",
        turnCount,
      });
    }

    return {
      totalActiveBusinesses,
      totalRegisteredUsers,
      turnsToday: sum(turnsTodayRows),
      turnsThisWeek: sum(turnsWeekRows),
      range: {
        fromDate: toDateStr(fromDate),
        toDate: toDateStr(toDate),
        totalTurns: sum(rangeRows),
        cancelledTurns: rangeCounts.cancelled,
        cancellationRate,
        topBusinesses,
        topCategories,
      },
    };
  }
}
