import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresBusinessRepo } from "../../src/modules/business/infrastructure/PostgresBusinessRepo";
import { prisma } from "../../src/shared/infrastructure/prisma";
import type { FindManyBusinessesFilters } from "../../src/modules/business/domain/IBusinessRepo";

/**
 * The subscription-shaped filters are the one place a Business query reaches
 * across a relation and reinterprets a stored value (a lapsed trial counts as
 * expired), so the SQL itself is what has to be proven — the in-memory fake
 * only re-implements the same rule in TypeScript and would agree with a wrong
 * query. Requires `npm run test:integration:setup`.
 */
describe("PostgresBusinessRepo subscription filters (real Postgres)", () => {
  const repo = new PostgresBusinessRepo();

  const ownerId = randomUUID();
  const categoryId = randomUUID();
  // One organization per scenario: Subscription.organizationId is unique.
  const orgs = {
    payingPro: randomUUID(),
    liveTrialBasic: randomUUID(),
    lapsedTrialBasic: randomUUID(),
    expiredPro: randomUUID(),
    noSubscription: randomUUID(),
  };
  const businessIdByOrg = new Map<string, string>();

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `integration-biz-filters-${ownerId}@example.com`,
        firstName: "Filters",
        lastName: "Owner",
      },
    });
    await prisma.businessCategory.create({
      data: { id: categoryId, name: `Filters Category ${categoryId}`, slug: `filters-${categoryId}` },
    });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const subscriptions: Record<string, { plan: "BASIC" | "PRO"; status: "TRIAL" | "ACTIVE" | "EXPIRED"; trialEndsAt: Date | null } | null> = {
      [orgs.payingPro]: { plan: "PRO", status: "ACTIVE", trialEndsAt: null },
      [orgs.liveTrialBasic]: { plan: "BASIC", status: "TRIAL", trialEndsAt: tomorrow },
      [orgs.lapsedTrialBasic]: { plan: "BASIC", status: "TRIAL", trialEndsAt: yesterday },
      [orgs.expiredPro]: { plan: "PRO", status: "EXPIRED", trialEndsAt: null },
      [orgs.noSubscription]: null,
    };

    for (const [organizationId, subscription] of Object.entries(subscriptions)) {
      await prisma.organization.create({ data: { id: organizationId, name: `Org ${organizationId}` } });
      if (subscription) {
        await prisma.subscription.create({ data: { id: randomUUID(), organizationId, ...subscription } });
      }
      const businessId = randomUUID();
      businessIdByOrg.set(organizationId, businessId);
      await prisma.business.create({
        data: {
          id: businessId,
          name: `Business ${businessId}`,
          slug: `filters-business-${businessId}`,
          categoryId,
          ownerUserId: ownerId,
          organizationId,
          status: "APPROVED",
        },
      });
    }
  });

  afterAll(async () => {
    const organizationIds = Object.values(orgs);
    await prisma.business.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.businessCategory.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  // Scoped to this suite's own rows: the test database is shared.
  const matchingOrgs = async (subscription: FindManyBusinessesFilters["subscription"]) => {
    const rows = await repo.findMany({ categoryId, subscription });
    const ids = new Set(rows.map((business) => business.id));
    return Object.entries(orgs)
      .filter(([, organizationId]) => ids.has(businessIdByOrg.get(organizationId) as string))
      .map(([name]) => name)
      .sort();
  };

  it("matches an exact plan and status through the Organization relation", async () => {
    expect(await matchingOrgs({ plan: "pro", effectiveStatus: "active" })).toEqual(["payingPro"]);
  });

  it("counts a trial past trialEndsAt as expired, alongside genuinely expired rows", async () => {
    expect(await matchingOrgs({ effectiveStatus: "expired" })).toEqual(["expiredPro", "lapsedTrialBasic"]);
  });

  it("excludes a lapsed trial from 'trial', keeping only the live one", async () => {
    expect(await matchingOrgs({ effectiveStatus: "trial" })).toEqual(["liveTrialBasic"]);
  });

  it("applies plan and effective status together", async () => {
    expect(await matchingOrgs({ plan: "basic", effectiveStatus: "expired" })).toEqual(["lapsedTrialBasic"]);
    expect(await matchingOrgs({ plan: "pro", effectiveStatus: "trial" })).toEqual([]);
  });

  it("filters on plan alone, whatever the status", async () => {
    expect(await matchingOrgs({ plan: "basic" })).toEqual(["lapsedTrialBasic", "liveTrialBasic"]);
  });

  it("never matches an organization with no subscription row, but includes it when unfiltered", async () => {
    for (const subscription of [{ plan: "basic" as const }, { effectiveStatus: "expired" as const }]) {
      expect(await matchingOrgs(subscription)).not.toContain("noSubscription");
    }
    expect(await matchingOrgs(undefined)).toContain("noSubscription");
  });

  it("countMany agrees with findMany for the same filter", async () => {
    const subscription = { effectiveStatus: "expired" as const };
    const rows = await repo.findMany({ categoryId, subscription });
    expect(await repo.countMany({ categoryId, subscription })).toBe(rows.length);
  });

  it("paginates in the database, so a page never loads more rows than its size", async () => {
    const page = await repo.findMany({
      categoryId,
      sortBy: "businessName",
      sortDir: "asc",
      skip: 1,
      take: 2,
    });

    expect(page).toHaveLength(2);
  });
});
