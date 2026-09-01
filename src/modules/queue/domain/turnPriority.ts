import type { TurnPriority } from "./Turn";

/**
 * Canonical "who goes first" ordering — lower rank means served sooner.
 * Single source of truth for the priority-rank comparator that used to be
 * hand-copied across PostgresTurnRepo (twice) and the in-memory test fake
 * (three times) — five independent copies that could each drift on their
 * own, which is exactly what already happened once (see the future-reservation
 * bugfix note in docs/epica-4-canales-entrada.md).
 */
export const TURN_PRIORITY_ORDER: readonly TurnPriority[] = [
  "arrived",
  "physical",
  "in_transit",
  "registered",
];

const RANK_BY_PRIORITY = new Map<TurnPriority, number>(
  TURN_PRIORITY_ORDER.map((priority, index) => [priority, index + 1]),
);

export const turnPriorityRank = (priority: TurnPriority): number =>
  RANK_BY_PRIORITY.get(priority) ?? TURN_PRIORITY_ORDER.length + 1;
