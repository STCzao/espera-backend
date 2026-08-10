import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveBusinessUseCase } from "../../../src/modules/business/application/ApproveBusinessUseCase";
import { InMemoryBusinessRepo, InMemoryUserRepo, buildBusiness, buildUser } from "../../helpers/authFakes";
import {
  InMemoryOrganizationRepo,
  InMemorySubscriptionRepo,
  buildOrganization,
  buildSubscription,
} from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo } from "../../helpers/queueFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessApprovedEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessApprovedEmail: emailMocks.sendBusinessApprovedEmail,
}));

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID      = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID    = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  organizationRepo?: InMemoryOrganizationRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
  userRepo?: InMemoryUserRepo;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: "user-1", organizationId: ORG_ID, status: "pending" }),
  ]);
  const organizationRepo = options.organizationRepo ?? new InMemoryOrganizationRepo([
    buildOrganization({ id: ORG_ID, status: "approved", legalId: "30-1" }),
  ]);
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, status: "pending" }),
  ]);
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser({ id: "user-1" })]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const windowRepo = options.windowRepo ?? new InMemoryServiceWindowRepo();
  return {
    businessRepo, organizationRepo, subscriptionRepo, userRepo, queueRepo, windowRepo,
    useCase: new ApproveBusinessUseCase(businessRepo, organizationRepo, subscriptionRepo, userRepo, queueRepo, windowRepo),
  };
};

describe("ApproveBusinessUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessApprovedEmail.mockResolvedValue(undefined);
  });

  it("approves the business and records who/when", async () => {
    const { useCase, businessRepo } = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    expect(result.status).toBe("approved");
    expect(result.approvedByUserId).toBe(ADMIN_ID);
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(businessRepo.all()[0].status).toBe("approved");
  });

  it("starts a 30-day trial on the subscription", async () => {
    const before = new Date();
    const { useCase, subscriptionRepo } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    const sub = subscriptionRepo.all()[0];
    expect(sub.status).toBe("trial");
    const diffDays = Math.round(((sub.trialEndsAt as Date).getTime() - before.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it("does not downgrade an already-active subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "active" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    expect(subscriptionRepo.all()[0].status).toBe("active");
  });

  it("creates a default queue with a default service window when the business has none", async () => {
    const { useCase, queueRepo, windowRepo } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    const queues = queueRepo.all();
    expect(queues).toHaveLength(1);
    expect(queues[0]).toMatchObject({ name: "Caja principal", prefix: "A", isActive: true });

    const windows = await windowRepo.findByQueueId(queues[0].id);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ name: "Ventanilla 1", type: "cashier", isActive: true });
  });

  it("does not create a duplicate queue or window if a queue already exists", async () => {
    const queueRepo = new InMemoryQueueRepo([
      { id: "q-1", businessId: BUSINESS_ID, name: "Caja principal", prefix: "A", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const windowRepo = new InMemoryServiceWindowRepo();
    const { useCase } = buildUseCase({ queueRepo, windowRepo });

    await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    expect(queueRepo.all()).toHaveLength(1);
    expect(await windowRepo.findByQueueId("q-1")).toHaveLength(0);
  });

  it("sends the approval email to the business owner", async () => {
    const { useCase } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    expect(emailMocks.sendBusinessApprovedEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
      "Cafe Espera",
    );
  });

  it("completes approval even when the email fails", async () => {
    emailMocks.sendBusinessApprovedEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).resolves.toMatchObject({ status: "approved" });
  });

  describe("errores", () => {
    it("throws 404 when business does not exist", async () => {
      const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 409 when business is already approved", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID, status: "approved" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_ALREADY_APPROVED" });
    });

    it("throws 409 when business is suspended, directing to reactivate instead", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID, status: "suspended" }),
      ]);
      const { useCase } = buildUseCase({ businessRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "BUSINESS_SUSPENDED_USE_REACTIVATE" });
    });

    it("throws 409 when the organization is not approved yet", async () => {
      const organizationRepo = new InMemoryOrganizationRepo([
        buildOrganization({ id: ORG_ID, status: "pending" }),
      ]);
      const { useCase } = buildUseCase({ organizationRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORGANIZATION_NOT_APPROVED" });
    });

    it("throws 409 when the organization was rejected", async () => {
      const organizationRepo = new InMemoryOrganizationRepo([
        buildOrganization({ id: ORG_ID, status: "rejected" }),
      ]);
      const { useCase } = buildUseCase({ organizationRepo });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORGANIZATION_NOT_APPROVED" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});

describe("ApproveBusinessUseCase — coherencia con la Organization (HU-8.7)", () => {
  const CATEGORY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const OTHER_CATEGORY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("approves without a note when there are no coherence alerts", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID, status: "pending", categoryId: CATEGORY_ID }),
    ]);
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "approved", legalId: "30-1", categoryId: CATEGORY_ID }),
    ]);
    const { useCase } = buildUseCase({ businessRepo, organizationRepo });

    const result = await useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID });

    expect(result.status).toBe("approved");
    expect(result.approvalAlertsSnapshot).toEqual([]);
  });

  it("requires a note when the business category does not match the organization's", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID, status: "pending", categoryId: CATEGORY_ID }),
    ]);
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "approved", legalId: "30-1", categoryId: OTHER_CATEGORY_ID }),
    ]);
    const { useCase } = buildUseCase({ businessRepo, organizationRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 400, code: "APPROVAL_NOTE_REQUIRED" });
  });

  it("requires a note when the organization has no legalId", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "approved" }),
    ]);
    const { useCase } = buildUseCase({ organizationRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 400, code: "APPROVAL_NOTE_REQUIRED" });
  });

  it("approves and snapshots the alerts present when a note is given", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "approved" }),
    ]);
    const { useCase } = buildUseCase({ organizationRepo });

    const result = await useCase.execute({
      businessId: BUSINESS_ID,
      approvedByUserId: ADMIN_ID,
      note: "Verificado por teléfono con el titular",
    });

    expect(result.status).toBe("approved");
    expect(result.approvalNote).toBe("Verificado por teléfono con el titular");
    expect(result.approvalAlertsSnapshot).toEqual(["MISSING_LEGAL_ID"]);
  });
});

describe("ApproveBusinessUseCase — estado de la subscription", () => {
  it("rejects approval when the subscription is cancelled", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "cancelled" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_NOT_ACTIVE" });
  });

  it("rejects approval when the subscription is expired", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "expired" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_NOT_ACTIVE" });
  });

  it("detects a lazily-expired trial and rejects approval", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial", trialEndsAt: new Date(Date.now() - 1000) }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_NOT_ACTIVE" });
    expect(subscriptionRepo.all()[0].status).toBe("expired");
  });

  it("allows approval when the subscription is active", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "active" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, approvedByUserId: ADMIN_ID }),
    ).resolves.toMatchObject({ status: "approved" });
  });
});
