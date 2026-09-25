import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { CommercialState, ISubscriptionRepo, SubscriptionPlan, SubscriptionStatus } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo, ResolveEffectiveSubscriptionStatusUseCase, computeCommercialState } from "@modules/organization/public-api";
import type { BusinessStatus } from "../domain/Business";
import type { BusinessSubscriptionFilters, IBusinessRepo } from "../domain/IBusinessRepo";
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
 * Collapses the three subscription-shaped query params into the single
 * plan + effective-status pair the repo can push into SQL.
 *
 * `commercialState` is just those two fields pre-combined for operators
 * (see computeCommercialState), so it decomposes back into them exactly;
 * when it is combined with the individual params, every condition applies,
 * which is what an operator ticking both boxes means. A contradictory
 * combination (e.g. commercialState "paying_pro" with plan "basic") simply
 * matches nothing, same as before.
 */
const toSubscriptionFilters = (input: {
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  commercialState?: CommercialState;
}): BusinessSubscriptionFilters | undefined => {
  const fromCommercialState = COMMERCIAL_STATE_FILTERS[input.commercialState ?? "none"];

  const plan = input.subscriptionPlan ?? fromCommercialState?.plan;
  const effectiveStatus = input.subscriptionStatus ?? fromCommercialState?.effectiveStatus;
  if (!plan && !effectiveStatus) return undefined;

  return { plan, effectiveStatus };
};

const COMMERCIAL_STATE_FILTERS: Record<CommercialState | "none", BusinessSubscriptionFilters | undefined> = {
  none:              undefined,
  pending_approval:  { effectiveStatus: "pending" },
  trialing_basic:    { effectiveStatus: "trial",  plan: "basic" },
  trialing_pro:      { effectiveStatus: "trial",  plan: "pro" },
  trialing_premium:  { effectiveStatus: "trial",  plan: "premium" },
  paying_basic:      { effectiveStatus: "active", plan: "basic" },
  paying_pro:        { effectiveStatus: "active", plan: "pro" },
  paying_premium:    { effectiveStatus: "active", plan: "premium" },
  expired:           { effectiveStatus: "expired" },
  cancelled:         { effectiveStatus: "cancelled" },
};

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
    const baseFilters = {
      organizationId,
      categoryId,
      status,
      subscription: toSubscriptionFilters(parsed.data),
    };
    // Scoped to this call, not the instance — this use case is constructed
    // once and reused across requests, so caching on `this` would leak one
    // request's subscription data into every later request for that org.
    const subscriptionByOrgId = new Map<string, { plan: SubscriptionPlan; status: SubscriptionStatus } | null>();

    // Filtering, ordering, pagination and the total all happen in Postgres,
    // including the subscription-derived filters: the repo resolves those
    // against the related Subscription row (see BusinessSubscriptionFilters),
    // so only the current page's businesses are ever loaded. Reading every
    // matching business to filter and slice in memory, as this used to do,
    // grew with the whole table.
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
