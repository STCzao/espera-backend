import { randomUUID } from "node:crypto";

import type { IQueueRepo } from "../../src/modules/queue/domain/IQueueRepo";
import type { ActiveTurnSummary, BusinessTurnCount, CreateTurnData, ITurnRepo, PlatformTurnCounts, RecentCallItem, TurnDayRaw, TurnHistoryItem } from "../../src/modules/queue/domain/ITurnRepo";
import type { Queue } from "../../src/modules/queue/domain/Queue";
import type { IServiceWindowRepo } from "../../src/modules/queue/domain/IServiceWindowRepo";
import type { ServiceWindow } from "../../src/modules/queue/domain/ServiceWindow";
import type { Turn, TurnPriority, TurnSource } from "../../src/modules/queue/domain/Turn";

export const buildServiceWindow = (overrides: Partial<ServiceWindow> = {}): ServiceWindow => ({
  id:        "window-1",
  queueId:   "queue-1",
  name:      "Ventanilla 1",
  type:      "cashier",
  isActive:  true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export class InMemoryServiceWindowRepo implements IServiceWindowRepo {
  private readonly windows = new Map<string, ServiceWindow>();

  public constructor(initialWindows: ServiceWindow[] = []) {
    initialWindows.forEach((w) => this.windows.set(w.id, w));
  }

  public async findById(id: string): Promise<ServiceWindow | null> {
    return this.windows.get(id) ?? null;
  }

  public async findByQueueId(queueId: string): Promise<ServiceWindow[]> {
    return [...this.windows.values()]
      .filter((w) => w.queueId === queueId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async save(entity: ServiceWindow): Promise<ServiceWindow> {
    this.windows.set(entity.id, entity);
    return entity;
  }

  public async delete(id: string): Promise<void> {
    this.windows.delete(id);
  }

  public all(): ServiceWindow[] {
    return [...this.windows.values()];
  }
}

export const buildQueue = (overrides: Partial<Queue> = {}): Queue => ({
  id: "queue-1",
  businessId: "business-1",
  name: "Caja principal",
  prefix: "A",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const buildTurn = (overrides: Partial<Turn> = {}): Turn => {
  // Defaults to whatever createdAt ends up being, same as every real turn
  // except a phone reservation with a declared ETA — so tests that only
  // override createdAt (most of them, predating queueJoinedAt) keep working
  // without having to also repeat queueJoinedAt everywhere.
  const createdAt = overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "turn-1",
    queueId: "queue-1",
    businessId: "business-1",
    number: 1,
    displayNumber: "A-001",
    status: "waiting",
    priority: "registered",
    source: "app",
    turnDate: new Date("2026-01-01T00:00:00.000Z"),
    queueJoinedAt: createdAt,
    createdAt,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
};

export class InMemoryQueueRepo implements IQueueRepo {
  private readonly queues = new Map<string, Queue>();

  public constructor(initialQueues: Queue[] = []) {
    initialQueues.forEach((q) => this.queues.set(q.id, q));
  }

  public async findById(id: string): Promise<Queue | null> {
    return this.queues.get(id) ?? null;
  }

  public async findByBusinessId(businessId: string): Promise<Queue[]> {
    return [...this.queues.values()].filter((q) => q.businessId === businessId);
  }

  public async findActiveByBusinessId(businessId: string): Promise<Queue | null> {
    return (
      [...this.queues.values()].find((q) => q.businessId === businessId && q.isActive) ?? null
    );
  }

  public async save(entity: Queue): Promise<Queue> {
    this.queues.set(entity.id, entity);
    return entity;
  }

  public all(): Queue[] {
    return [...this.queues.values()];
  }
}

export class InMemoryTurnRepo implements ITurnRepo {
  private readonly turns = new Map<string, Turn>();

  public constructor(initialTurns: Turn[] = []) {
    initialTurns.forEach((t) => this.turns.set(t.id, t));
  }

  public async findById(id: string): Promise<Turn | null> {
    return this.turns.get(id) ?? null;
  }

  public async createWithNextNumber(data: CreateTurnData): Promise<Turn> {
    const existing = [...this.turns.values()].filter(
      (t) =>
        t.queueId === data.queueId &&
        t.turnDate.getTime() === data.turnDate.getTime(),
    );
    const number = existing.length + 1;
    const displayNumber = `${data.prefix}-${String(number).padStart(3, "0")}`;

    const turn: Turn = {
      id: randomUUID(),
      queueId: data.queueId,
      businessId: data.businessId,
      customerId: data.customerId,
      guestName: data.guestName,
      phone: data.phone,
      number,
      displayNumber,
      status: "waiting",
      priority: data.priority,
      source: data.source,
      turnDate: data.turnDate,
      queueJoinedAt: data.queueJoinedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.turns.set(turn.id, turn);
    return turn;
  }

  public async findNextWaitingTurn(queueId: string): Promise<Turn | null> {
    const PRIORITY_RANK: Record<string, number> = {
      arrived: 1, physical: 2, in_transit: 3, registered: 4,
    };
    const waiting = [...this.turns.values()].filter(
      (t) => t.queueId === queueId && t.status === "waiting",
    );
    waiting.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const byJoin = a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();
      return byJoin !== 0 ? byJoin : a.number - b.number;
    });
    return waiting[0] ?? null;
  }

  public async findCalledTurnByQueue(queueId: string): Promise<Turn | null> {
    return (
      [...this.turns.values()].find((t) => t.queueId === queueId && t.status === "called") ?? null
    );
  }

  public async findActiveByCustomerInAnyBusiness(customerId: string): Promise<Turn | null> {
    return (
      [...this.turns.values()].find(
        (t) => t.customerId === customerId && (t.status === "waiting" || t.status === "called" || t.status === "attending" || t.status === "redirected"),
      ) ?? null
    );
  }

  public async findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null> {
    return (
      [...this.turns.values()].find(
        (t) =>
          t.customerId === customerId &&
          t.queueId === queueId &&
          (t.status === "waiting" || t.status === "called" || t.status === "attending" || t.status === "redirected"),
      ) ?? null
    );
  }

  public async findAttendingByServiceWindow(serviceWindowId: string): Promise<Turn | null> {
    return (
      [...this.turns.values()].find(
        (t) => t.serviceWindowId === serviceWindowId && t.status === "attending",
      ) ?? null
    );
  }

  public async getPlatformTurnCounts(fromDate: Date, toDate: Date): Promise<PlatformTurnCounts> {
    const inRange = [...this.turns.values()].filter(
      (t) => t.turnDate.getTime() >= fromDate.getTime() && t.turnDate.getTime() <= toDate.getTime(),
    );
    return {
      completed: inRange.filter((t) => t.status === "completed").length,
      cancelled: inRange.filter((t) => t.status === "cancelled").length,
    };
  }

  public async getTurnCountsByBusiness(fromDate: Date, toDate: Date): Promise<BusinessTurnCount[]> {
    const inRange = [...this.turns.values()].filter(
      (t) => t.turnDate.getTime() >= fromDate.getTime() && t.turnDate.getTime() <= toDate.getTime(),
    );
    const counts = new Map<string, number>();
    inRange.forEach((t) => {
      counts.set(t.businessId, (counts.get(t.businessId) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([businessId, turnCount]) => ({ businessId, turnCount }))
      .sort((a, b) => b.turnCount - a.turnCount);
  }

  public async countWaitingAhead(queueId: string, queueJoinedAt: Date, turnNumber: number, priority: TurnPriority): Promise<number> {
    const PRIORITY_RANK: Record<string, number> = {
      arrived: 1, physical: 2, in_transit: 3, registered: 4,
    };
    const myRank = PRIORITY_RANK[priority] ?? 5;
    return [...this.turns.values()].filter((t) => {
      if (t.queueId !== queueId || t.status !== "waiting") return false;
      const theirRank = PRIORITY_RANK[t.priority] ?? 5;
      if (theirRank < myRank) return true;
      if (theirRank !== myRank) return false;
      if (t.queueJoinedAt.getTime() < queueJoinedAt.getTime()) return true;
      if (t.queueJoinedAt.getTime() === queueJoinedAt.getTime() && t.number < turnNumber) return true;
      return false;
    }).length;
  }

  public async getAverageServiceMinutes(queueId: string, turnDate: Date): Promise<number | null> {
    const sevenDaysAgo = new Date(turnDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const completed = [...this.turns.values()].filter(
      (t) =>
        t.queueId === queueId &&
        t.turnDate.getTime() >= sevenDaysAgo.getTime() &&
        t.turnDate.getTime() <= turnDate.getTime() &&
        t.status === "completed" &&
        t.startedAttentionAt != null &&
        t.attendedAt != null,
    );
    if (completed.length === 0) return null;
    const total = completed.reduce(
      (sum, t) => sum + (t.attendedAt!.getTime() - t.startedAttentionAt!.getTime()) / 60_000,
      0,
    );
    return total / completed.length;
  }

  public async findActiveByQueue(queueId: string): Promise<ActiveTurnSummary[]> {
    const PRIORITY_RANK: Record<string, number> = {
      arrived: 1, physical: 2, in_transit: 3, registered: 4,
    };
    const active = [...this.turns.values()].filter(
      (t) => t.queueId === queueId && (t.status === "waiting" || t.status === "called" || t.status === "attending" || t.status === "redirected"),
    );
    active.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const byJoin = a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();
      return byJoin !== 0 ? byJoin : a.number - b.number;
    });
    return active.map((t) => ({
      turnId: t.id,
      displayNumber: t.displayNumber,
      customerName: null,
      guestName: t.guestName ?? null,
      queueJoinedAt: t.queueJoinedAt,
      phone: t.phone ?? null,
      source: t.source as TurnSource,
      priority: t.priority as TurnPriority,
      status: t.status as "waiting" | "called" | "attending" | "redirected",
      createdAt: t.createdAt,
      serviceWindowId: t.serviceWindowId ?? null,
      startedAttentionAt: t.startedAttentionAt ?? null,
    }));
  }

  public async findRecentCalls(queueId: string, limit: number): Promise<RecentCallItem[]> {
    return [...this.turns.values()]
      .filter((t) => t.queueId === queueId && t.calledAt != null)
      .sort((a, b) => b.calledAt!.getTime() - a.calledAt!.getTime())
      .slice(0, limit)
      .map((t) => ({
        turnId: t.id,
        displayNumber: t.displayNumber,
        serviceWindowId: t.serviceWindowId ?? null,
        serviceWindowName: null,
        calledAt: t.calledAt!,
      }));
  }

  public async getRawMetricsByDate(queueId: string, date: Date): Promise<TurnDayRaw> {
    const turns = [...this.turns.values()].filter(
      (t) => t.queueId === queueId && t.turnDate.getTime() === date.getTime(),
    );
    return {
      completedTurns: turns
        .filter((t) => t.status === "completed" && t.startedAttentionAt != null && t.attendedAt != null)
        .map((t) => ({ startedAttentionAt: t.startedAttentionAt!, attendedAt: t.attendedAt! })),
      cancelledCount: turns.filter((t) => t.status === "cancelled").length,
    };
  }

  public async findHistoryByQueue(queueId: string, date: Date): Promise<TurnHistoryItem[]> {
    return [...this.turns.values()]
      .filter(
        (t) =>
          t.queueId === queueId &&
          (t.status === "completed" || t.status === "cancelled") &&
          t.turnDate.getTime() === date.getTime(),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((t) => ({
        turnId:        t.id,
        displayNumber: t.displayNumber,
        customerName:  null,
        guestName:     t.guestName ?? null,
        source:        t.source as TurnSource,
        priority:      t.priority as TurnPriority,
        status:        t.status as "completed" | "cancelled",
        createdAt:     t.createdAt,
        calledAt:      t.calledAt ?? null,
        attendedAt:    t.attendedAt ?? null,
        cancelledAt:   t.cancelledAt ?? null,
        waitMinutes:   t.calledAt ? Math.round((t.calledAt.getTime() - t.createdAt.getTime()) / 60_000) : null,
      }));
  }

  public async save(entity: Turn): Promise<Turn> {
    this.turns.set(entity.id, entity);
    return entity;
  }

  public all(): Turn[] {
    return [...this.turns.values()];
  }
}
