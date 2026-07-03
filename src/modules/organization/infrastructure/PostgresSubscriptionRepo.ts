import { prisma } from "@shared/infrastructure/prisma";
import type { ISubscriptionRepo } from "../domain/ISubscriptionRepo";
import type { Subscription, SubscriptionPlan, SubscriptionStatus } from "../domain/Subscription";

const toPlanEnum = (plan: SubscriptionPlan): "BASIC" | "PRO" | "PREMIUM" =>
  plan.toUpperCase() as "BASIC" | "PRO" | "PREMIUM";

const toStatusEnum = (status: SubscriptionStatus) =>
  status.toUpperCase() as "PENDING" | "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELLED";

const toSubscription = (record: {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Subscription => ({
  id: record.id,
  organizationId: record.organizationId,
  plan: record.plan.toLowerCase() as SubscriptionPlan,
  status: record.status.toLowerCase() as SubscriptionStatus,
  trialEndsAt: record.trialEndsAt,
  cancellationReason: record.cancellationReason,
  cancelledAt: record.cancelledAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class PostgresSubscriptionRepo implements ISubscriptionRepo {
  public async findById(id: string): Promise<Subscription | null> {
    const row = await prisma.subscription.findUnique({ where: { id } });
    return row ? toSubscription(row) : null;
  }

  public async findByOrganizationId(organizationId: string): Promise<Subscription | null> {
    const row = await prisma.subscription.findUnique({ where: { organizationId } });
    return row ? toSubscription(row) : null;
  }

  public async save(entity: Subscription): Promise<Subscription> {
    const data = {
      plan: toPlanEnum(entity.plan),
      status: toStatusEnum(entity.status),
      trialEndsAt: entity.trialEndsAt,
      cancellationReason: entity.cancellationReason,
      cancelledAt: entity.cancelledAt,
    };

    const row = await prisma.subscription.upsert({
      where: { id: entity.id },
      create: { id: entity.id, organizationId: entity.organizationId, ...data },
      update: data,
    });

    return toSubscription(row);
  }
}
