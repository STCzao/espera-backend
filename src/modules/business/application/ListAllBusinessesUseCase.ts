import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo, SubscriptionPlan, SubscriptionStatus } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo, ResolveEffectiveSubscriptionStatusUseCase } from "@modules/organization/public-api";
import type { BusinessStatus } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const BUSINESS_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
const SUBSCRIPTION_PLANS = ["basic", "pro", "premium"] as const;
const SUBSCRIPTION_STATUSES = ["pending", "trial", "active", "expired", "cancelled"] as const;

const schema = z.object({
  organizationId:     z.string().uuid("Invalid organization id.").optional(),
  categoryId:         z.string().uuid("Invalid category id.").optional(),
  status:             z.enum(BUSINESS_STATUSES).optional(),
  subscriptionPlan:   z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
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

    const businesses = await this.businessRepo.findMany({
      organizationId: parsed.data.organizationId,
      categoryId: parsed.data.categoryId,
      status: parsed.data.status,
    });

    // Cached by organizationId so businesses under the same account don't
    // each trigger their own Subscription lookup.
    const subscriptionByOrgId = new Map<string, { plan: SubscriptionPlan; status: SubscriptionStatus } | null>();
    const items: BusinessListItem[] = [];
    for (const business of businesses) {
      if (!subscriptionByOrgId.has(business.organizationId)) {
        const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
          .execute({ organizationId: business.organizationId });
        subscriptionByOrgId.set(
          business.organizationId,
          subscription ? { plan: subscription.plan, status: subscription.status } : null,
        );
      }
      const subscription = subscriptionByOrgId.get(business.organizationId);

      items.push({
        businessId: business.id,
        businessName: business.name,
        organizationId: business.organizationId,
        status: business.status,
        categoryId: business.categoryId,
        subscriptionPlan: subscription?.plan,
        subscriptionStatus: subscription?.status,
        createdAt: business.createdAt.toISOString(),
      });
    }

    const filtered = items.filter((item) => {
      if (parsed.data.subscriptionPlan && item.subscriptionPlan !== parsed.data.subscriptionPlan) return false;
      if (parsed.data.subscriptionStatus && item.subscriptionStatus !== parsed.data.subscriptionStatus) return false;
      return true;
    });

    const sortDir = parsed.data.sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const cmp = parsed.data.sortBy === "businessName"
        ? a.businessName.localeCompare(b.businessName)
        : a.createdAt.localeCompare(b.createdAt);
      return cmp * sortDir;
    });

    const total = filtered.length;
    const page = parsed.data.page;
    const pageSize = parsed.data.pageSize;
    const pageItems = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return { items: pageItems, page, pageSize, total };
  }
}
