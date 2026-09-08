import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { CommercialState, ISubscriptionRepo, SubscriptionPlan, SubscriptionStatus } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo, ResolveEffectiveSubscriptionStatusUseCase, computeCommercialState } from "@modules/organization/public-api";
import type { BusinessStatus } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const BUSINESS_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
const SUBSCRIPTION_PLANS = ["basic", "pro", "premium"] as const;
const SUBSCRIPTION_STATUSES = ["pending", "trial", "active", "expired", "cancelled"] as const;
// Kept in sync by hand with CommercialState (organization/domain/CommercialState.ts)
// — deriving it from that union at the type level isn't worth the
// indirection for one const array.
const COMMERCIAL_STATES = [
  "pending_approval",
  "trialing_basic", "trialing_pro", "trialing_premium",
  "paying_basic", "paying_pro", "paying_premium",
  "expired", "cancelled",
] as const;

const schema = z.object({
  organizationId:     z.string().uuid("Invalid organization id.").optional(),
  categoryId:         z.string().uuid("Invalid category id.").optional(),
  status:             z.enum(BUSINESS_STATUSES).optional(),
  subscriptionPlan:   z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  // Filters on the same plan+status data as the two fields above — a
  // convenience for operators who think in "is this real revenue?" terms
  // instead of the two underlying enums (see docs/epica-2-5-cuentas-organizaciones.md).
  commercialState:    z.enum(COMMERCIAL_STATES).optional(),
  sortBy:             z.enum(["businessName", "createdAt"]).default("createdAt"),
  sortDir:            z.enum(["asc", "desc"]).default("desc"),
  page:               z.number().int().min(1).default(1),
  pageSize:           z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// z.input (not z.infer/z.output) so callers can omit the fields that carry a
// .default() — see the same note in GetPlatformMetricsUseCase.
export type ListAllBusinessesInput = z.input<typeof schema>;

export interface BusinessListItem {
  businessId: string;
  businessName: string;
  organizationId: string;
  status: BusinessStatus;
  categoryId: string;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  commercialState?: CommercialState;
  createdAt: string;
}

export interface ListAllBusinessesOutput {
  items: BusinessListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Admin-facing business directory for the Backoffice "Negocios" screen —
 * deliberately independent from Turn/date-range data (unlike
 * GetPlatformMetricsUseCase's topBusinesses). A business with zero turns in
 * any given window still needs to show up here, e.g. to find and manage a
 * suspended business that hasn't operated recently.
 */
export class ListAllBusinessesUseCase
  implements UseCase<ListAllBusinessesInput, ListAllBusinessesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
  ) {}

  public async execute(input: ListAllBusinessesInput): Promise<ListAllBusinessesOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { organizationId, categoryId, status, sortBy, sortDir, page, pageSize } = parsed.data;
    const baseFilters = { organizationId, categoryId, status };
    // Scoped to this call, not the instance — this use case is constructed
    // once and reused across requests, so caching on `this` would leak one
    // request's subscription data into every later request for that org.
    const subscriptionByOrgId = new Map<string, { plan: SubscriptionPlan; status: SubscriptionStatus } | null>();

    // subscriptionPlan/subscriptionStatus/commercialState are *derived* —
    // ResolveEffectiveSubscriptionStatusUseCase lazily reconciles them from
    // Subscription, they aren't queryable Business columns — so they can't
    // be pushed into the same WHERE as the rest. Without them,
    // pagination/sorting/count all go straight to Postgres and only the
    // current page's businesses ever get a Subscription lookup.
    if (!parsed.data.subscriptionPlan && !parsed.data.subscriptionStatus && !parsed.data.commercialState) {
      const [businesses, total] = await Promise.all([
        this.businessRepo.findMany({
          ...baseFilters, sortBy, sortDir, skip: (page - 1) * pageSize, take: pageSize,
        }),
        this.businessRepo.countMany(baseFilters),
      ]);

      const items = await Promise.all(
        businesses.map((business) => this.toListItem(business, subscriptionByOrgId)),
      );

      return { items, page, pageSize, total };
    }

    // With a subscription filter, every matching business needs its
    // Subscription resolved before we know if it belongs on the page —
    // this is the one path that still reads the full filtered set and
    // paginates in memory.
    const businesses = await this.businessRepo.findMany(baseFilters);
    const items = await Promise.all(
      businesses.map((business) => this.toListItem(business, subscriptionByOrgId)),
    );

    const filtered = items.filter((item) => {
      if (parsed.data.subscriptionPlan && item.subscriptionPlan !== parsed.data.subscriptionPlan) return false;
      if (parsed.data.subscriptionStatus && item.subscriptionStatus !== parsed.data.subscriptionStatus) return false;
      if (parsed.data.commercialState && item.commercialState !== parsed.data.commercialState) return false;
      return true;
    });

    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const cmp = sortBy === "businessName"
        ? a.businessName.localeCompare(b.businessName)
        : a.createdAt.localeCompare(b.createdAt);
      return cmp * dirMultiplier;
    });

    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return { items: pageItems, page, pageSize, total };
  }

  private async toListItem(
    business: Awaited<ReturnType<IBusinessRepo["findMany"]>>[number],
    subscriptionByOrgId: Map<string, { plan: SubscriptionPlan; status: SubscriptionStatus } | null>,
  ): Promise<BusinessListItem> {
    if (!subscriptionByOrgId.has(business.organizationId)) {
      const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
        .execute({ organizationId: business.organizationId });
      subscriptionByOrgId.set(
        business.organizationId,
        subscription ? { plan: subscription.plan, status: subscription.status } : null,
      );
    }
    const subscription = subscriptionByOrgId.get(business.organizationId);

    return {
      businessId: business.id,
      businessName: business.name,
      organizationId: business.organizationId,
      status: business.status,
      categoryId: business.categoryId,
      subscriptionPlan: subscription?.plan,
      subscriptionStatus: subscription?.status,
      commercialState: subscription ? computeCommercialState(subscription) : undefined,
      createdAt: business.createdAt.toISOString(),
    };
  }
}
