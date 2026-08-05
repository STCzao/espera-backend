import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { ISubscriptionRepo, SubscriptionPlan, SubscriptionStatus } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo, ResolveEffectiveSubscriptionStatusUseCase } from "@modules/organization/public-api";
import type { ITurnRepo } from "@modules/queue/public-api";
import { PostgresTurnRepo } from "@modules/queue/public-api";
import type { IBusinessCategoryRepo } from "../domain/IBusinessCategoryRepo";
import type { BusinessStatus } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessCategoryRepo } from "../infrastructure/PostgresBusinessCategoryRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TOP_CATEGORIES_N = 5;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 50;
const WEEK_DAYS = 7;

const BUSINESS_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
const SUBSCRIPTION_PLANS = ["basic", "pro", "premium"] as const;
const SUBSCRIPTION_STATUSES = ["pending", "trial", "active", "expired", "cancelled"] as const;

const schema = z.object({
  fromDate:           z.string().regex(DATE_REGEX, "fromDate must be in YYYY-MM-DD format.").optional(),
  toDate:             z.string().regex(DATE_REGEX, "toDate must be in YYYY-MM-DD format.").optional(),
  organizationId:     z.string().uuid("Invalid organization id.").optional(),
  categoryId:         z.string().uuid("Invalid category id.").optional(),
  status:             z.enum(BUSINESS_STATUSES).optional(),
  subscriptionPlan:   z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  sortBy:             z.enum(["turnCount", "businessName"]).default("turnCount"),
  sortDir:            z.enum(["asc", "desc"]).default("desc"),
  page:               z.number().int().min(1).default(1),
  pageSize:           z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// z.input (not z.infer/z.output) so callers can omit the fields that carry
// a .default() — Zod fills them in during parsing, but the *input* type
// still needs to allow undefined for that to typecheck at call sites.
export type GetPlatformMetricsInput = z.input<typeof schema>;

export interface BusinessMetricItem {
  businessId: string;
  businessName: string;
  organizationId: string;
  status: BusinessStatus;
  categoryId: string;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
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
    businesses: {
      items: BusinessMetricItem[];
      page: number;
      pageSize: number;
      total: number;
    };
    topCategories: TopCategoryMetric[];
  };
}

const parseUTCDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const toDateStr = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Platform-wide metrics for the Backoffice dashboard (HU-8.5, extended with
 * filters/sort/pagination + Subscription plan/status per business — plain
 * metrics without any commercial context weren't useful for actually
 * managing accounts). Unlike GetQueueMetricsUseCase (Épica 3), which scopes
 * to a single Queue, this aggregates across every Business/Turn/Subscription
 * in the system.
 */
export class GetPlatformMetricsUseCase
  implements UseCase<GetPlatformMetricsInput, GetPlatformMetricsOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly categoryRepo: IBusinessCategoryRepo = new PostgresBusinessCategoryRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
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

    // Resolved once and reused for both the business listing and the
    // category aggregation below, to avoid fetching each Business twice.
    const subscriptionByOrgId = new Map<string, { plan: SubscriptionPlan; status: SubscriptionStatus } | null>();
    const businessDetails: BusinessMetricItem[] = [];
    for (const row of rangeRows) {
      const business = await this.businessRepo.findById(row.businessId);
      if (!business) continue;

      if (!subscriptionByOrgId.has(business.organizationId)) {
        const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
          .execute({ organizationId: business.organizationId });
        subscriptionByOrgId.set(
          business.organizationId,
          subscription ? { plan: subscription.plan, status: subscription.status } : null,
        );
      }
      const subscription = subscriptionByOrgId.get(business.organizationId);

      businessDetails.push({
        businessId: business.id,
        businessName: business.name,
        organizationId: business.organizationId,
        status: business.status,
        categoryId: business.categoryId,
        subscriptionPlan: subscription?.plan,
        subscriptionStatus: subscription?.status,
        turnCount: row.turnCount,
      });
    }

    const filtered = businessDetails.filter((item) => {
      if (parsed.data.organizationId && item.organizationId !== parsed.data.organizationId) return false;
      if (parsed.data.categoryId && item.categoryId !== parsed.data.categoryId) return false;
      if (parsed.data.status && item.status !== parsed.data.status) return false;
      if (parsed.data.subscriptionPlan && item.subscriptionPlan !== parsed.data.subscriptionPlan) return false;
      if (parsed.data.subscriptionStatus && item.subscriptionStatus !== parsed.data.subscriptionStatus) return false;
      return true;
    });

    const sortDir = parsed.data.sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const cmp = parsed.data.sortBy === "businessName"
        ? a.businessName.localeCompare(b.businessName)
        : a.turnCount - b.turnCount;
      return cmp * sortDir;
    });

    const total = filtered.length;
    const page = parsed.data.page;
    const pageSize = parsed.data.pageSize;
    const items = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const turnCountByCategory = new Map<string, number>();
    for (const item of businessDetails) {
      turnCountByCategory.set(
        item.categoryId,
        (turnCountByCategory.get(item.categoryId) ?? 0) + item.turnCount,
      );
    }

    const topCategoryEntries = [...turnCountByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CATEGORIES_N);
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
        businesses: { items, page, pageSize, total },
        topCategories,
      },
    };
  }
}
