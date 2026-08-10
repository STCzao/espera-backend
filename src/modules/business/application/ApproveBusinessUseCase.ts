import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendBusinessApprovedEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { IOrganizationRepo, ISubscriptionRepo } from "@modules/organization/public-api";
import { PostgresOrganizationRepo, PostgresSubscriptionRepo, ResolveEffectiveSubscriptionStatusUseCase } from "@modules/organization/public-api";
import type { IQueueRepo, IServiceWindowRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo, PostgresServiceWindowRepo } from "@modules/queue/public-api";
import type { UseCase } from "../../../shared/kernel/UseCase";
import { computeBusinessCoherenceAlerts } from "./businessCoherence";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const TRIAL_DAYS = 30;

const schema = z.object({
  businessId:       z.string().uuid("Invalid business id."),
  approvedByUserId: z.string().uuid("Invalid approver id."),
  note:             z.string().trim().max(500).optional(),
});

export type ApproveBusinessInput = z.infer<typeof schema>;

/**
 * Approves a single Business (HU-8.3). Independent from approving other
 * Business under the same Organization — this is the second of the two
 * approval gates, and requires the Organization to already be approved.
 */
export class ApproveBusinessUseCase implements UseCase<ApproveBusinessInput, Business> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly organizationRepo: IOrganizationRepo = new PostgresOrganizationRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: ApproveBusinessInput): Promise<Business> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.status === "approved") {
      throw AppError.conflict("Business is already approved.", "BUSINESS_ALREADY_APPROVED");
    }

    // A suspended business has its own, more specific flow (ReactivateBusinessUseCase,
    // HU-8.4) that records reactivatedByUserId/At — approving it here instead
    // would silently skip that audit trail.
    if (business.status === "suspended") {
      throw AppError.conflict(
        "A suspended business must be reactivated, not approved.",
        "BUSINESS_SUSPENDED_USE_REACTIVATE",
      );
    }

    const organization = await this.organizationRepo.findById(business.organizationId);
    if (!organization || organization.status !== "approved") {
      throw AppError.conflict(
        "The business's organization must be approved before approving this business.",
        "ORGANIZATION_NOT_APPROVED",
      );
    }

    // Reconciled here (not read raw) so a trial that silently expired isn't
    // treated as still active just because nothing ever flipped it.
    const subscription = await new ResolveEffectiveSubscriptionStatusUseCase(this.subscriptionRepo)
      .execute({ organizationId: business.organizationId });
    if (subscription && (subscription.status === "cancelled" || subscription.status === "expired")) {
      throw AppError.conflict(
        "The business's organization subscription is not active.",
        "SUBSCRIPTION_NOT_ACTIVE",
      );
    }

    const alerts = computeBusinessCoherenceAlerts(business, organization);
    if (alerts.length > 0 && !parsed.data.note) {
      throw AppError.badRequest(
        "A note is required to approve a business with coherence alerts.",
        "APPROVAL_NOTE_REQUIRED",
      );
    }

    const now = new Date();
    const updated = await this.businessRepo.save({
      ...business,
      status: "approved",
      approvedByUserId: parsed.data.approvedByUserId,
      approvedAt: now,
      rejectedReason: undefined,
      rejectedAt: undefined,
      approvalNote: parsed.data.note,
      approvalAlertsSnapshot: alerts,
      updatedAt: now,
    });

    if (subscription && subscription.status === "pending") {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
      await this.subscriptionRepo.save({ ...subscription, status: "trial", trialEndsAt });
    }

    const existingQueue = await this.queueRepo.findActiveByBusinessId(business.id);
    if (!existingQueue) {
      const queue = await this.queueRepo.save({
        id:         randomUUID(),
        businessId: business.id,
        name:       "Caja principal",
        prefix:     "A",
        isActive:   true,
        createdAt:  now,
        updatedAt:  now,
      });

      // Every Queue needs at least one real ServiceWindow to be usable —
      // this is what makes it safe for wait-time estimation to rely only on
      // real ServiceWindow rows, with no legacy fallback counter needed.
      await this.windowRepo.save({
        id:        randomUUID(),
        queueId:   queue.id,
        name:      "Ventanilla 1",
        type:      "cashier",
        isActive:  true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const owner = await this.userRepo.findById(business.ownerUserId);
    if (owner) {
      try {
        await sendBusinessApprovedEmail(owner.email, owner.firstName, business.name);
      } catch (error) {
        logger.error(
          { error, businessId: business.id },
          "Business approved but confirmation email could not be sent",
        );
      }
    }

    return updated;
  }
}
