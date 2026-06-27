import { prisma } from "@shared/infrastructure/prisma";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription, SubscriptionPlan } from "../domain/Subscription";

const toPlanEnum = (plan: SubscriptionPlan): "BASIC" | "PRO" | "PREMIUM" =>
  plan.toUpperCase() as "BASIC" | "PRO" | "PREMIUM";

const toSubscription = (record: {
  id: string;
  organizationId: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}): Subscription => ({
  id: record.id,
  organizationId: record.organizationId,
  plan: record.plan.toLowerCase() as SubscriptionPlan,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class PostgresSubscriptionRepo implements ISubscriptionRepo {
  public async findById(id: string): Promise<Subscription | null> {
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    return subscription ? toSubscription(subscription) : null;
  }

  public async findByOrganizationId(organizationId: string): Promise<Subscription | null> {
    const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
    return subscription ? toSubscription(subscription) : null;
  }

  public async save(entity: Subscription): Promise<Subscription> {
    const subscription = await prisma.subscription.upsert({
      where: { id: entity.id },
      create: {
        id: entity.id,
        organizationId: entity.organizationId,
        plan: toPlanEnum(entity.plan),
      },
      update: {
        plan: toPlanEnum(entity.plan),
      },
    });

    return toSubscription(subscription);
  }
}
