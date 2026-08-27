import { z } from "zod";

import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import type { PlanLimit } from "@modules/organization/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization id."),
});

export type EnforceQueueLimitsForOrganizationInput = z.infer<typeof schema> & {
  limit: PlanLimit;
};

export interface EnforceQueueLimitsForOrganizationOutput {
  deactivatedQueueIds: string[];
  deactivatedServiceWindowIds: string[];
}

/**
 * Deactivates active Queues/ServiceWindows in excess of `limit`, for every
 * Business under an Organization — the counterpart to a subscription
 * becoming cancelled/expired. Nothing is deleted or loses history; it's the
 * same isActive flip ToggleQueueUseCase/ToggleServiceWindowUseCase already
 * do, just applied on the account's behalf instead of by the owner
 * clicking through each one. Renewing (ActivateOrganizationSubscriptionUseCase)
 * does NOT auto-reactivate what this turns off — same "explicit action, not
 * automatic" reasoning as no_show: the owner picks which queue/window comes
 * back with the toggle that already exists, not the system.
 *
 * Keeps the oldest ones active (by createdAt) — consistent with
 * findActiveByBusinessId already treating "oldest active" as canonical.
 * Only trims windows on queues that stay active; a queue being deactivated
 * makes its windows moot regardless of their own count.
 */
export class EnforceQueueLimitsForOrganizationUseCase
  implements UseCase<EnforceQueueLimitsForOrganizationInput, EnforceQueueLimitsForOrganizationOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(
    input: EnforceQueueLimitsForOrganizationInput,
  ): Promise<EnforceQueueLimitsForOrganizationOutput> {
    const parsed = schema.parse({ organizationId: input.organizationId });

    const businesses = await this.businessRepo.findByOrganizationId(parsed.organizationId);

    const deactivatedQueueIds: string[] = [];
    const deactivatedServiceWindowIds: string[] = [];

    for (const business of businesses) {
      const queues = await this.queueRepo.findByBusinessId(business.id);
      const activeQueues = queues
        .filter((q) => q.isActive)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const queuesToKeep = activeQueues.slice(0, input.limit.maxQueuesPerBusiness);
      const queuesToDeactivate = activeQueues.slice(input.limit.maxQueuesPerBusiness);

      for (const queue of queuesToDeactivate) {
        await this.queueRepo.save({ ...queue, isActive: false, updatedAt: new Date() });
        deactivatedQueueIds.push(queue.id);
      }

      for (const queue of queuesToKeep) {
        const windows = await this.windowRepo.findByQueueId(queue.id);
        const activeWindows = windows
          .filter((w) => w.isActive)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        const windowsToDeactivate = activeWindows.slice(input.limit.maxServiceWindowsPerQueue);
        for (const window of windowsToDeactivate) {
          await this.windowRepo.save({ ...window, isActive: false, updatedAt: new Date() });
          deactivatedServiceWindowIds.push(window.id);
        }
      }
    }

    return { deactivatedQueueIds, deactivatedServiceWindowIds };
  }
}
