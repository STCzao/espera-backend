import type { SubscriptionPlan } from "./Subscription";

export interface PlanLimit {
  maxBusinesses: number;
  maxQueuesPerBusiness: number;
  maxServiceWindowsPerQueue: number;
}

/**
 * Single source of truth for the commercial plan grid (Épica 2.5).
 *
 * maxQueuesPerBusiness is 1 across every plan, on purpose: a second Queue
 * only means something if a customer can be routed to it (pick a service,
 * scan a queue-specific QR, etc.), and no entry point does that today —
 * CreateGuestTurnUseCase and the QR flow always resolve the single
 * "active" queue via findActiveByBusinessId. Selling "more queues" before
 * that routing exists just lets an account fragment its own numbering and
 * wait count for no benefit. The one-queue-many-windows model already
 * covers the real target use case (a hair salon with several stylists
 * sharing one line) — see docs/epica-3-cola.md, "Reformulación del pitch
 * de planes". CreateQueueUseCase/ToggleQueueUseCase stay fully working;
 * raising this back up per-plan is a one-line change once customer-facing
 * queue routing ships.
 *
 * maxServiceWindowsPerQueue is the real lever inside a single business:
 * Basic = 1 (one counter, no parallel attention), Pro = up to 10 (several
 * staff attending in parallel — the salon case), Premium = up to 20.
 * Premium's ceiling is a high, finite number (not Infinity) — commercially
 * it should feel unlimited for any real use case, but an actual Infinity
 * here would leave CreateServiceWindowUseCase with zero guardrail against
 * runaway row creation (bug or abuse).
 *
 * maxBusinesses: Basic/Pro = 1 (Organization is 1:1 with its owner, so this
 * is the only way to have more than one Business under one account at all
 * — not a convenience cap). Premium = 3, not unlimited — the only real
 * signal so far is a single 2-location prospect; promising Infinity before
 * the product's been run at that scale is the same over-promise pattern as
 * the queue routing above. Raise it when an account actually needs more —
 * there's no per-organization override yet, so today that means raising
 * this constant for every Premium account, not just one.
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimit> = {
  basic: { maxBusinesses: 1, maxQueuesPerBusiness: 1, maxServiceWindowsPerQueue: 1 },
  pro: { maxBusinesses: 1, maxQueuesPerBusiness: 1, maxServiceWindowsPerQueue: 10 },
  premium: { maxBusinesses: 3, maxQueuesPerBusiness: 1, maxServiceWindowsPerQueue: 20 },
};
