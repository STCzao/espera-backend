import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo, SubscriptionPlan } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo } from "@modules/organization/public-api";
import type { IQueueRepo, IServiceWindowRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo, PostgresServiceWindowRepo } from "@modules/queue/public-api";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const listMyBusinessesSchema = z.object({
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ListMyBusinessesInput = z.infer<typeof listMyBusinessesSchema>;

export interface ListMyBusinessesOutput {
  businesses: Array<{
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    status: string;
    phone?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    activeServiceWindows: number;
    listingStatus: string;
    operationalStatus: string;
    plan: SubscriptionPlan;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    activeQueueId: string | null;
    // Every queue the business has, not just the one activeQueueId resolves
    // to — a Pro/Premium business can have more than one, and until now
    // there was no way for the panel to even know the others existed.
    queues: Array<{
      id: string;
      name: string;
      prefix: string;
      isActive: boolean;
      activeServiceWindows: number;
    }>;
  }>;
}

export class ListMyBusinessesUseCase
  implements UseCase<ListMyBusinessesInput, ListMyBusinessesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: ListMyBusinessesInput): Promise<ListMyBusinessesOutput> {
    const parsed = listMyBusinessesSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const businesses = await this.businessRepo.findByOwnerUserId(parsed.data.ownerUserId);

    const results = await Promise.all(
      businesses.map(async (business) => {
        const [subscription, activeQueue, allQueues] = await Promise.all([
          this.subscriptionRepo.findByOrganizationId(business.organizationId),
          this.queueRepo.findActiveByBusinessId(business.id),
          this.queueRepo.findByBusinessId(business.id),
        ]);

        const queues = await Promise.all(
          allQueues.map(async (queue) => {
            const windows = await this.windowRepo.findByQueueId(queue.id);
            return {
              id: queue.id,
              name: queue.name,
              prefix: queue.prefix,
              isActive: queue.isActive,
              activeServiceWindows: windows.filter((w) => w.isActive).length,
            };
          }),
        );

        // Unchanged from before: the count for the single queue
        // activeQueueId resolves to, not the business total across queues.
        const activeServiceWindows = activeQueue
          ? queues.find((q) => q.id === activeQueue.id)?.activeServiceWindows ?? 0
          : 0;

        return {
          id: business.id,
          name: business.name,
          slug: business.slug,
          categoryId: business.categoryId,
          status: business.status,
          phone: business.phone,
          address: business.address,
          latitude: business.latitude,
          longitude: business.longitude,
          activeServiceWindows,
          listingStatus: business.listingStatus,
          operationalStatus: business.operationalStatus,
          plan: subscription?.plan ?? "basic",
          subscriptionStatus: subscription?.status ?? "pending",
          trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
          activeQueueId: activeQueue?.id ?? null,
          queues,
        };
      }),
    );

    return { businesses: results };
  }
}
