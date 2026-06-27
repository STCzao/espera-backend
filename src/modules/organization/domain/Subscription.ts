export type SubscriptionPlan = "basic" | "pro" | "premium";

/**
 * The commercial plan for an Organization. There is a single active
 * Subscription per Organization (current plan, not historical).
 */
export interface Subscription {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  createdAt: Date;
  updatedAt: Date;
}
