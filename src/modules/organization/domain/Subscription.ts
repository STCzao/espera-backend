export type SubscriptionPlan = "basic" | "pro" | "premium";
export type SubscriptionStatus = "pending" | "trial" | "active" | "expired" | "cancelled";

export interface Subscription {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
