import type { SubscriptionPlan, SubscriptionStatus } from "./Subscription";

export type CommercialState =
  | "pending_approval"
  | "trialing_basic"
  | "trialing_pro"
  | "trialing_premium"
  | "paying_basic"
  | "paying_pro"
  | "paying_premium"
  | "expired"
  | "cancelled";

/**
 * Collapses plan + status into the one label a Backoffice operator actually
 * needs — "is this real revenue or still free?" — instead of making them
 * cross-reference two independent enums to answer that for every
 * organization in a list.
 */
export function computeCommercialState(
  subscription: { plan: SubscriptionPlan; status: SubscriptionStatus },
): CommercialState {
  switch (subscription.status) {
    case "pending":
      return "pending_approval";
    case "trial":
      return `trialing_${subscription.plan}`;
    case "active":
      return `paying_${subscription.plan}`;
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
  }
}
