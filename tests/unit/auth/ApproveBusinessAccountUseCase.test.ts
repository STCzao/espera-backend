import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveBusinessAccountUseCase } from "../../../src/modules/auth/application/ApproveBusinessAccountUseCase";
import {
  InMemoryBusinessRepo,
  InMemoryUserRepo,
  buildBusiness,
  buildUser,
} from "../../helpers/authFakes";
import {
  InMemorySubscriptionRepo,
  buildSubscription,
} from "../../helpers/organizationFakes";
import { InMemoryQueueRepo } from "../../helpers/queueFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessWelcomeEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessWelcomeEmail: emailMocks.sendBusinessWelcomeEmail,
}));

const ORG_ID = "organization-1";

const buildUseCase = (options: {
  userRepo?: InMemoryUserRepo;
  businessRepo?: InMemoryBusinessRepo;
  subscriptionRepo?: InMemorySubscriptionRepo;
  queueRepo?: InMemoryQueueRepo;
} = {}) => {
  const userRepo = options.userRepo ?? new InMemoryUserRepo([
    buildUser({ role: "business_admin", approvalStatus: "pending" }),
  ]);
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ ownerUserId: "user-1", organizationId: ORG_ID, status: "pending" }),
  ]);
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, status: "pending" }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  return {
    userRepo,
    businessRepo,
    subscriptionRepo,
    queueRepo,
    useCase: new ApproveBusinessAccountUseCase(userRepo, businessRepo, subscriptionRepo, queueRepo),
  };
};

describe("ApproveBusinessAccountUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessWelcomeEmail.mockResolvedValue(undefined);
  });

  it("sets user approvalStatus to approved", async () => {
    const { useCase, userRepo } = buildUseCase();

    const result = await useCase.execute({ userId: "user-1" });

    expect(result).toEqual({ userId: "user-1", approvalStatus: "approved" });
    expect((await userRepo.findById("user-1"))?.approvalStatus).toBe("approved");
  });

  it("sets pending businesses to approved", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "biz-1", ownerUserId: "user-1", organizationId: ORG_ID, status: "pending" }),
      buildBusiness({ id: "biz-2", slug: "other", ownerUserId: "user-1", organizationId: ORG_ID, status: "pending" }),
    ]);
    const { useCase } = buildUseCase({ businessRepo });

    await useCase.execute({ userId: "user-1" });

    expect(businessRepo.all().every((b) => b.status === "approved")).toBe(true);
  });

  it("starts a 30-day trial on the subscription", async () => {
    const before = new Date();
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "pending" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await useCase.execute({ userId: "user-1" });

    const sub = subscriptionRepo.all()[0];
    expect(sub.status).toBe("trial");
    expect(sub.trialEndsAt).toBeInstanceOf(Date);
    const diffDays = Math.round(
      ((sub.trialEndsAt as Date).getTime() - before.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(30);
  });

  it("does not downgrade an already-active subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "active" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await useCase.execute({ userId: "user-1" });

    expect(subscriptionRepo.all()[0].status).toBe("active");
  });

  it("marks email as verified so the user can login even if they never clicked the link", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ role: "business_admin", approvalStatus: "pending", isEmailVerified: false }),
    ]);
    const { useCase } = buildUseCase({ userRepo });

    await useCase.execute({ userId: "user-1" });

    expect((await userRepo.findById("user-1"))?.isEmailVerified).toBe(true);
  });

  it("sends welcome email after approval", async () => {
    const { useCase } = buildUseCase();

    await useCase.execute({ userId: "user-1" });

    expect(emailMocks.sendBusinessWelcomeEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
    );
  });

  it("completes approval even when welcome email fails", async () => {
    emailMocks.sendBusinessWelcomeEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const { useCase, userRepo } = buildUseCase();

    await expect(useCase.execute({ userId: "user-1" })).resolves.toEqual({
      userId: "user-1",
      approvalStatus: "approved",
    });
    expect((await userRepo.findById("user-1"))?.approvalStatus).toBe("approved");
  });

  it("creates a default queue when a pending business is approved", async () => {
    const { useCase, queueRepo } = buildUseCase();

    await useCase.execute({ userId: "user-1" });

    const queues = queueRepo.all();
    expect(queues).toHaveLength(1);
    expect(queues[0]).toMatchObject({ name: "Caja principal", prefix: "A", isActive: true });
  });

  it("does not create a duplicate queue if one already exists", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: "biz-1", ownerUserId: "user-1", organizationId: ORG_ID, status: "pending" }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      { id: "q-1", businessId: "biz-1", name: "Caja principal", prefix: "A", isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const { useCase } = buildUseCase({ businessRepo, queueRepo });

    await useCase.execute({ userId: "user-1" });

    expect(queueRepo.all()).toHaveLength(1);
  });

  it("rejects non-business-admin accounts", async () => {
    const { useCase } = buildUseCase({
      userRepo: new InMemoryUserRepo([buildUser({ role: "user" })]),
    });

    await expect(useCase.execute({ userId: "user-1" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Only business admin accounts can be approved.",
    });
  });
});
