import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ISubscriptionRepo, SubscriptionPlan } from "@modules/organization/public-api";
import { PostgresSubscriptionRepo } from "@modules/organization/public-api";
import type { IQueueRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo } from "@modules/queue/public-api";
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
  }>;
}

export class ListMyBusinessesUseCase
  implements UseCase<ListMyBusinessesInput, ListMyBusinessesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly subscriptionRepo: ISubscriptionRepo = new PostgresSubscriptionRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
  ) {}

  public async execute(input: ListMyBusinessesInput): Promise<ListMyBusinessesOutput> {
    const parsed = listMyBusinessesSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const businesses = await this.businessRepo.findByOwnerUserId(parsed.data.ownerUserId);

    const results = await Promise.all(
      businesses.map(async (business) => {
        const [subscription, queue] = await Promise.all([
          this.subscriptionRepo.findByOrganizationId(business.organizationId),
          this.queueRepo.findActiveByBusinessId(business.id),
        ]);

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
          activeServiceWindows: business.activeServiceWindows,
          listingStatus: business.listingStatus,
          operationalStatus: business.operationalStatus,
          plan: subscription?.plan ?? "basic",
          subscriptionStatus: subscription?.status ?? "pending",
          trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
          activeQueueId: queue?.id ?? null,
        };
      }),
    );

    return { businesses: results };
  }
}
