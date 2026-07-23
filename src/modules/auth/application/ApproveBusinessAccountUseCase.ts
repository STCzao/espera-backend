import { randomUUID } from "node:crypto";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { sendBusinessWelcomeEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";
import type { ISubscriptionRepo } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo } from "@modules/organization/public-api";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo } from "@modules/queue/public-api";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const TRIAL_DAYS = 30;

export interface ApproveBusinessAccountInput {
  userId: string;
}

export interface ApproveBusinessAccountOutput {
  userId: string;
  approvalStatus: "approved";
}

export class ApproveBusinessAccountUseCase implements UseCase<
  ApproveBusinessAccountInput,
  ApproveBusinessAccountOutput
> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
  ) {}

  public async execute(
    input: ApproveBusinessAccountInput,
  ): Promise<ApproveBusinessAccountOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw AppError.notFound("User not found.");
    }

    if (user.role !== "business_admin") {
      throw AppError.badRequest(
        "Only business admin accounts can be approved.",
      );
    }

    const updatedUser = await this.userRepo.save({
      ...user,
      approvalStatus: "approved",
      isEmailVerified: true,
    });

    const businesses = await this.businessRepo.findByOwnerUserId(input.userId);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    const approvedOrganizationIds = new Set<string>();

    for (const business of businesses) {
      if (business.status === "pending") {
        await this.businessRepo.save({ ...business, status: "approved" });
        const existingQueue = await this.queueRepo.findActiveByBusinessId(business.id);
        if (!existingQueue) {
          await this.queueRepo.save({
            id:         randomUUID(),
            businessId: business.id,
            name:       "Caja principal",
            prefix:     "A",
            isActive:   true,
            createdAt:  new Date(),
            updatedAt:  new Date(),
          });
        }
      }

      if (!approvedOrganizationIds.has(business.organizationId)) {
        approvedOrganizationIds.add(business.organizationId);
        const subscription = await this.subscriptionRepo.findByOrganizationId(
          business.organizationId,
        );
        if (subscription && subscription.status === "pending") {
          await this.subscriptionRepo.save({
            ...subscription,
            status: "trial",
            trialEndsAt,
          });
        }
      }
    }

    try {
      await sendBusinessWelcomeEmail(updatedUser.email, updatedUser.firstName);
    } catch (error) {
      logger.error(
        { error, userId: updatedUser.id },
        "Business account approved but welcome email could not be sent",
      );
    }

    return {
      userId: updatedUser.id,
      approvalStatus: "approved",
    };
  }
}
