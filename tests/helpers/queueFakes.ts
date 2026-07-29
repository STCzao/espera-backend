import { randomUUID } from "node:crypto";

import type { IQueueRepo } from "../../src/modules/queue/domain/IQueueRepo";
import type { ActiveTurnSummary, CreateTurnData, ITurnRepo, TurnDayRaw, TurnHistoryItem } from "../../src/modules/queue/domain/ITurnRepo";
import type { Queue } from "../../src/modules/queue/domain/Queue";
import type { IServiceWindowRepo } from "../../src/modules/queue/domain/IServiceWindowRepo";
import type { ServiceWindow } from "../../src/modules/queue/domain/ServiceWindow";
import type { Turn, TurnPriority, TurnSource } from "../../src/modules/queue/domain/Turn";

export const buildServiceWindow = (overrides: Partial<ServiceWindow> = {}): ServiceWindow => ({
  id:        "window-1",
  queueId:   "queue-1",
  name:      "Ventanilla 1",
  type:      "standard",
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

export const buildTurn = (overrides: Partial<Turn> = {}): Turn => ({
  id: "turn-1",
  queueId: "queue-1",
  businessId: "business-1",
  number: 1,
  displayNumber: "A-001",
  status: "waiting",
  priority: "registered",
  source: "app",
  turnDate: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

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
      number,
      displayNumber,
      status: "waiting",
      priority: data.priority,
      source: data.source,
      turnDate: data.turnDate,
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
      return pa !== pb ? pa - pb : a.createdAt.getTime() - b.createdAt.getTime();
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
        (t) => t.customerId === customerId && (t.status === "waiting" || t.status === "called" || t.status === "attending"),
      ) ?? null
    );
  }

  public async findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null> {
    return (
      [...this.turns.values()].find(
        (t) =>
          t.customerId === customerId &&
          t.queueId === queueId &&
          (t.status === "waiting" || t.status === "called" || t.status === "attending"),
      ) ?? null
    );
  }

  public async countWaitingAhead(queueId: string, turnNumber: number, priority: TurnPriority): Promise<number> {
    const PRIORITY_RANK: Record<string, number> = {
      arrived: 1, physical: 2, in_transit: 3, registered: 4,
    };
    const myRank = PRIORITY_RANK[priority] ?? 5;
    return [...this.turns.values()].filter((t) => {
      if (t.queueId !== queueId || t.status !== "waiting") return false;
      const theirRank = PRIORITY_RANK[t.priority] ?? 5;
      if (theirRank < myRank) return true;
      if (theirRank === myRank && t.number < turnNumber) return true;
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
      (t) => t.queueId === queueId && (t.status === "waiting" || t.status === "called" || t.status === "attending"),
    );
    active.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      return pa !== pb ? pa - pb : a.createdAt.getTime() - b.createdAt.getTime();
    });
    return active.map((t) => ({
      turnId: t.id,
      displayNumber: t.displayNumber,
      customerName: null,
      guestName: t.guestName ?? null,
      priority: t.priority as TurnPriority,
      status: t.status as "waiting" | "called",
      createdAt: t.createdAt,
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
          t.status === "completed" &&
          t.turnDate.getTime() === date.getTime() &&
          t.calledAt != null &&
          t.attendedAt != null,
      )
      .sort((a, b) => a.attendedAt!.getTime() - b.attendedAt!.getTime())
      .map((t) => ({
        turnId:        t.id,
        displayNumber: t.displayNumber,
        customerName:  null,
        guestName:     t.guestName ?? null,
        source:        t.source as TurnSource,
        priority:      t.priority as TurnPriority,
        createdAt:     t.createdAt,
        calledAt:      t.calledAt!,
        attendedAt:    t.attendedAt!,
        waitMinutes:   Math.round((t.calledAt!.getTime() - t.createdAt.getTime()) / 60_000),
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
