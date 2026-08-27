import { describe, expect, it } from "vitest";

import { EnforceQueueLimitsForOrganizationUseCase } from "../../../src/modules/queue/application/EnforceQueueLimitsForOrganizationUseCase";
import { PLAN_LIMITS } from "../../../src/modules/organization/domain/PlanLimits";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue, buildServiceWindow } from "../../helpers/queueFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  return {
    businessRepo, queueRepo, windowRepo,
    useCase: new EnforceQueueLimitsForOrganizationUseCase(businessRepo, queueRepo, windowRepo),
  };
};

describe("EnforceQueueLimitsForOrganizationUseCase", () => {
  it("deactivates every active queue beyond the limit, keeping the oldest", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-old", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildQueue({ id: "q-new", businessId: BUSINESS_ID, prefix: "B", isActive: true, createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.basic });

    expect(result.deactivatedQueueIds).toEqual(["q-new"]);
    expect(queueRepo.all().find((q) => q.id === "q-old")?.isActive).toBe(true);
    expect(queueRepo.all().find((q) => q.id === "q-new")?.isActive).toBe(false);
  });

  it("does not touch a queue already inactive", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_ID, prefix: "A", isActive: false }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.basic });

    expect(result.deactivatedQueueIds).toEqual([]);
  });

  it("trims active service windows beyond the limit on a queue that stays active", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-old", queueId: "q-1", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildServiceWindow({ id: "w-new", queueId: "q-1", isActive: true, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    ]);
    const { useCase } = buildUseCase({ queueRepo, windowRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.basic });

    expect(result.deactivatedServiceWindowIds).toEqual(["w-new"]);
    expect(windowRepo.all().find((w) => w.id === "w-old")?.isActive).toBe(true);
    expect(windowRepo.all().find((w) => w.id === "w-new")?.isActive).toBe(false);
  });

  it("does not trim windows on a queue that itself gets deactivated", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-old", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildQueue({ id: "q-excess", businessId: BUSINESS_ID, prefix: "B", isActive: true, createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-on-excess", queueId: "q-excess", isActive: true }),
    ]);
    const { useCase } = buildUseCase({ queueRepo, windowRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.basic });

    expect(result.deactivatedQueueIds).toEqual(["q-excess"]);
    expect(result.deactivatedServiceWindowIds).toEqual([]);
    expect(windowRepo.all().find((w) => w.id === "w-on-excess")?.isActive).toBe(true);
  });

  it("processes every business under the organization independently", async () => {
    const BUSINESS_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID }),
      buildBusiness({ id: BUSINESS_2, organizationId: ORG_ID }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-biz1-a", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildQueue({ id: "q-biz1-b", businessId: BUSINESS_ID, prefix: "B", isActive: true, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      buildQueue({ id: "q-biz2-a", businessId: BUSINESS_2, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    const { useCase } = buildUseCase({ businessRepo, queueRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.basic });

    expect(result.deactivatedQueueIds).toEqual(["q-biz1-b"]);
    expect(queueRepo.all().find((q) => q.id === "q-biz2-a")?.isActive).toBe(true);
  });

  it("does nothing when the limit already fits", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_ID, prefix: "A", isActive: true }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: "q-1", isActive: true }),
    ]);
    const { useCase } = buildUseCase({ queueRepo, windowRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, limit: PLAN_LIMITS.pro });

    expect(result.deactivatedQueueIds).toEqual([]);
    expect(result.deactivatedServiceWindowIds).toEqual([]);
  });
});
