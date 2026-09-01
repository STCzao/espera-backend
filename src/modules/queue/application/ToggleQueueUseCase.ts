import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import { EnsureQueueCreationAllowedUseCase } from "@modules/organization/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { Queue } from "../domain/Queue";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";

const schema = z.object({
  queueId:     z.string().uuid("Invalid queue id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ToggleQueueInput = z.infer<typeof schema>;

/**
 * Activates/deactivates an existing Queue — CreateQueueUseCase and
 * ListBusinessQueuesUseCase let a Business create and see its queues, but
 * nothing let it manage one afterward (unlike ServiceWindow, which has full
 * CRUD). isActive only gates new turn creation (CreateTurnUseCase) — it
 * doesn't strand anyone already in line, so there's no occupancy check here
 * like ToggleServiceWindowUseCase's.
 *
 * What it does guard: findActiveByBusinessId resolves "the" queue every
 * live entry point operates (panel, QR, web, manual) by picking the oldest
 * isActive one — deactivating a Business's only active queue would silently
 * break every entry point with no visible error, so that's blocked here.
 */
export class ToggleQueueUseCase implements UseCase<ToggleQueueInput, Queue> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly ensureQueueCreationAllowedUseCase: EnsureQueueCreationAllowedUseCase = new EnsureQueueCreationAllowedUseCase(),
  ) {}

  public async execute(input: ToggleQueueInput): Promise<Queue> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    const business = await this.businessRepo.findById(queue.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to configure this queue.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    if (queue.isActive) {
      const siblings = await this.queueRepo.findByBusinessId(business.id);
      const hasAnotherActive = siblings.some((q) => q.id !== queue.id && q.isActive);
      if (!hasAnotherActive) {
        throw AppError.conflict(
          "Cannot deactivate the business's only active queue.",
          "QUEUE_LAST_ACTIVE",
        );
      }
    } else {
      // Reactivating is a second door into the same slot CreateQueueUseCase
      // guards — a queue deactivated by EnforceQueueLimitsForOrganizationUseCase
      // (plan downgrade) must not come back for free.
      const siblings = await this.queueRepo.findByBusinessId(business.id);
      const activeQueueCount = siblings.filter((q) => q.id !== queue.id && q.isActive).length;
      await this.ensureQueueCreationAllowedUseCase.execute({
        organizationId: business.organizationId,
        currentQueueCountForBusiness: activeQueueCount,
      });
    }

    return this.queueRepo.save({ ...queue, isActive: !queue.isActive, updatedAt: new Date() });
  }
}
