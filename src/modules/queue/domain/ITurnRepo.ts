import type { Repository } from "../../../shared/kernel/Repository";
import type { Turn, TurnPriority, TurnSource, TurnStatus } from "./Turn";

export interface TurnDayRaw {
  completedTurns: Array<{ startedAttentionAt: Date; attendedAt: Date }>;
  cancelledCount: number;
  noShowCount: number;
}

export interface TurnHistoryItem {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  source: TurnSource;
  priority: TurnPriority;
  status: Extract<TurnStatus, "completed" | "cancelled" | "no_show">;
  createdAt: Date;
  calledAt: Date | null;
  attendedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  waitMinutes: number | null;
}

export interface CreateTurnData {
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  phone?: string;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  prefix: string;
  queueJoinedAt: Date;
}

export interface ActiveTurnSummary {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  phone: string | null;
  source: TurnSource;
  priority: TurnPriority;
  status: Extract<TurnStatus, "waiting" | "called" | "attending" | "redirected">;
  createdAt: Date;
  queueJoinedAt: Date;
  serviceWindowId: string | null;
  startedAttentionAt: Date | null;
}

export interface RecentCallItem {
  turnId: string;
  displayNumber: string;
  serviceWindowId: string | null;
  serviceWindowName: string | null;
  calledAt: Date;
}

export interface PlatformTurnCounts {
  completed: number;
  cancelled: number;
}

export interface BusinessTurnCount {
  businessId: string;
  turnCount: number;
}

export interface ITurnRepo extends Repository<Turn> {
  createWithNextNumber(data: CreateTurnData): Promise<Turn>;
  findNextWaitingTurn(queueId: string): Promise<Turn | null>;
  // Whether a WAITING turn exists whose queueJoinedAt is still in the future
  // (a phone reservation that hasn't reached its declared ETA yet) — lets
  // CallNextUseCase tell "nothing ready yet" apart from "queue is empty".
  hasPendingReservation(queueId: string): Promise<boolean>;
  findCalledTurnByQueue(queueId: string): Promise<Turn | null>;
  findActiveByCustomerInAnyBusiness(customerId: string): Promise<Turn | null>;
  findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null>;
  // turnNumber is the tiebreaker for turns whose queueJoinedAt is exactly
  // equal (common when a delay isn't declared — several turns can share the
  // same registration instant).
  //
  // Unlike findNextWaitingTurn/hasPendingReservation, this does NOT exclude
  // a phone reservation whose queueJoinedAt is still in the future — it
  // still holds its fair place in line and will be served before anyone who
  // joins after it, so it correctly counts toward another turn's personal
  // position/wait estimate (resolveTurnWaitStatus). It only stops mattering
  // once the reservation's own queueJoinedAt is later than the turn asking,
  // which the queueJoinedAt comparison already handles on its own.
  countWaitingAhead(queueId: string, queueJoinedAt: Date, turnNumber: number, priority: TurnPriority): Promise<number>;
  getAverageServiceMinutes(queueId: string, turnDate: Date): Promise<number | null>;
  // Also does NOT exclude future-dated reservations — this is the full
  // active list (used for the staff panel and per-item position/estimate in
  // GetQueueListUseCase), not "who's eligible to be called right now". A
  // caller that needs "how many are physically here" as a single aggregate
  // (e.g. GetQueueStatusUseCase.waitingCount, shown publicly) must filter by
  // `queueJoinedAt <= now` itself — counting a not-yet-due reservation there
  // would overstate the queue to someone who hasn't even arrived yet.
  findActiveByQueue(queueId: string): Promise<ActiveTurnSummary[]>;
  findHistoryByQueue(queueId: string, date: Date): Promise<TurnHistoryItem[]>;
  getRawMetricsByDate(queueId: string, date: Date): Promise<TurnDayRaw>;
  findRecentCalls(queueId: string, limit: number): Promise<RecentCallItem[]>;
  findAttendingByServiceWindow(serviceWindowId: string): Promise<Turn | null>;
  getPlatformTurnCounts(fromDate: Date, toDate: Date): Promise<PlatformTurnCounts>;
  getTurnCountsByBusiness(fromDate: Date, toDate: Date): Promise<BusinessTurnCount[]>;
}
