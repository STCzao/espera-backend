import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import { EnsureQueueCreationAllowedUseCase } from "@modules/organization/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { Queue } from "../domain/Queue";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  businessId:  z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  name:        z.string().trim().min(1, "Queue name is required.").max(100),
  prefix:      z.string().trim().min(1, "Prefix is required.").max(3, "Prefix must be at most 3 characters.")
    .regex(/^[A-Za-z]+$/, "Prefix must contain only letters."),
});

export type CreateQueueInput = z.infer<typeof schema>;

/**
 * Creates an additional Queue for a Business (the first one is created
 * automatically on approval, see ApproveBusinessUseCase). Plans grant more
 * than one Queue per Business from Pro upward (PLAN_LIMITS) — this is the
 * missing piece that let an account actually use that: until now
 * EnsureQueueCreationAllowedUseCase existed but nothing ever called it.
 */
export class CreateQueueUseCase implements UseCase<CreateQueueInput, Queue> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly ensureQueueCreationAllowedUseCase: EnsureQueueCreationAllowedUseCase = new EnsureQueueCreationAllowedUseCase(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: CreateQueueInput): Promise<Queue> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    if (business.status !== "approved") {
      throw AppError.conflict(
        "This business is not currently operating.",
        "BUSINESS_NOT_OPERATING",
      );
    }

    const existingQueues = await this.queueRepo.findByBusinessId(business.id);

    // Plan limit counts only active queues — a deactivated one (via
    // ToggleQueueUseCase) shouldn't occupy its slot forever. Prefix
    // uniqueness below still checks every queue regardless of isActive:
    // reusing a prefix while the old queue still exists (just paused)
    // would be confusing if it's ever reactivated.
    const activeQueueCount = existingQueues.filter((queue) => queue.isActive).length;
    await this.ensureQueueCreationAllowedUseCase.execute({
      organizationId: business.organizationId,
      currentQueueCountForBusiness: activeQueueCount,
    });

    const prefix = parsed.data.prefix.toUpperCase();
    const prefixTaken = existingQueues.some((queue) => queue.prefix.toUpperCase() === prefix);
    if (prefixTaken) {
      throw AppError.conflict(
        "This business already has a queue using that prefix.",
        "QUEUE_PREFIX_ALREADY_IN_USE",
      );
    }

    const now = new Date();
    const queue = await this.queueRepo.save({
      id: randomUUID(),
      businessId: business.id,
      name: parsed.data.name,
      prefix,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Every Queue needs at least one real ServiceWindow to be usable — see
    // the same default creation in ApproveBusinessUseCase.
    await this.windowRepo.save({
      id:        randomUUID(),
      queueId:   queue.id,
      name:      "Ventanilla 1",
      type:      "cashier",
      isActive:  true,
      createdAt: now,
      updatedAt: now,
    });

    return queue;
  }
}
