import type { SubscriptionPlan } from "./Subscription";

export interface PlanLimit {
  maxBusinesses: number;
  maxQueuesPerBusiness: number;
}

/**
 * Single source of truth for the commercial plan grid (Épica 2.5):
 * Basic = 1 business / 1 queue, Pro = 1 business / many queues,
 * Premium = many businesses / many queues each.
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimit> = {
  basic: { maxBusinesses: 1, maxQueuesPerBusiness: 1 },
  pro: { maxBusinesses: 1, maxQueuesPerBusiness: Infinity },
  premium: { maxBusinesses: Infinity, maxQueuesPerBusiness: Infinity },
};
