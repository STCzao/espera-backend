import type { SubscriptionPlan } from "./Subscription";

export interface PlanLimit {
  maxBusinesses: number;
  maxQueuesPerBusiness: number;
  maxServiceWindowsPerQueue: number;
}

/**
 * Single source of truth for the commercial plan grid (Épica 2.5):
 * Basic = 1 business / 1 queue / 1 service window per queue (a single
 * counter, no parallel attention), Pro = 1 business / many queues / up to 3
 * service windows per queue, Premium = many businesses / many queues each.
 *
 * Premium's maxServiceWindowsPerQueue is a high, finite ceiling (not
 * Infinity) — commercially it should feel unlimited for any real use case,
 * but an actual Infinity here would leave the CreateServiceWindowUseCase
 * path with zero guardrail against runaway row creation (bug or abuse).
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimit> = {
  basic: { maxBusinesses: 1, maxQueuesPerBusiness: 1, maxServiceWindowsPerQueue: 1 },
  pro: { maxBusinesses: 1, maxQueuesPerBusiness: Infinity, maxServiceWindowsPerQueue: 3 },
  premium: { maxBusinesses: Infinity, maxQueuesPerBusiness: Infinity, maxServiceWindowsPerQueue: 20 },
};
