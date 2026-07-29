import type { Repository } from "../../../shared/kernel/Repository";
import type { Turn, TurnPriority, TurnSource, TurnStatus } from "./Turn";

export interface TurnDayRaw {
  completedTurns: Array<{ startedAttentionAt: Date; attendedAt: Date }>;
  cancelledCount: number;
}

export interface TurnHistoryItem {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  source: TurnSource;
  priority: TurnPriority;
  createdAt: Date;
  calledAt: Date;
  attendedAt: Date;
  waitMinutes: number;
}

export interface CreateTurnData {
  queueId: string;
  businessId: string;
  customerId?: string;
  guestName?: string;
  priority: TurnPriority;
  source: TurnSource;
  turnDate: Date;
  prefix: string;
}

export interface ActiveTurnSummary {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  priority: TurnPriority;
  status: Extract<TurnStatus, "waiting" | "called" | "attending">;
  createdAt: Date;
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

export interface ITurnRepo extends Repository<Turn> {
  createWithNextNumber(data: CreateTurnData): Promise<Turn>;
  findNextWaitingTurn(queueId: string): Promise<Turn | null>;
  findCalledTurnByQueue(queueId: string): Promise<Turn | null>;
  findActiveByCustomerInAnyBusiness(customerId: string): Promise<Turn | null>;
  findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null>;
  countWaitingAhead(queueId: string, turnNumber: number, priority: TurnPriority): Promise<number>;
  getAverageServiceMinutes(queueId: string, turnDate: Date): Promise<number | null>;
  findActiveByQueue(queueId: string): Promise<ActiveTurnSummary[]>;
  findHistoryByQueue(queueId: string, date: Date): Promise<TurnHistoryItem[]>;
  getRawMetricsByDate(queueId: string, date: Date): Promise<TurnDayRaw>;
  findRecentCalls(queueId: string, limit: number): Promise<RecentCallItem[]>;
}
