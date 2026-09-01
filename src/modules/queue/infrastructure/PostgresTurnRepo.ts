import { randomUUID } from "node:crypto";

import { prisma } from "@shared/infrastructure/prisma";
import type { Turn, TurnPriority, TurnSource, TurnStatus } from "../domain/Turn";
import type { ActiveTurnSummary, BusinessTurnCount, CreateTurnData, ITurnRepo, PlatformTurnCounts, RecentCallItem, TurnDayRaw, TurnHistoryItem } from "../domain/ITurnRepo";

const toTurn = (raw: {
  id: string;
  queueId: string;
  businessId: string;
  customerId: string | null;
  guestName: string | null;
  phone: string | null;
  serviceWindowId: string | null;
  number: number;
  displayNumber: string;
  status: string;
  priority: string;
  source: string;
  turnDate: Date;
  queueJoinedAt: Date;
  calledAt: Date | null;
  startedAttentionAt: Date | null;
  attendedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Turn => ({
  id: raw.id,
  queueId: raw.queueId,
  businessId: raw.businessId,
  customerId: raw.customerId ?? undefined,
  guestName: raw.guestName ?? undefined,
  phone: raw.phone ?? undefined,
  serviceWindowId: raw.serviceWindowId ?? undefined,
  number: raw.number,
  displayNumber: raw.displayNumber,
  status: raw.status.toLowerCase() as TurnStatus,
  priority: raw.priority.toLowerCase().replace("_", "-") as TurnPriority,
  source: raw.source.toLowerCase() as TurnSource,
  turnDate: raw.turnDate,
  queueJoinedAt: raw.queueJoinedAt,
  calledAt: raw.calledAt ?? undefined,
  startedAttentionAt: raw.startedAttentionAt ?? undefined,
  attendedAt: raw.attendedAt ?? undefined,
  cancelledAt: raw.cancelledAt ?? undefined,
  noShowAt: raw.noShowAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const toPriorityEnum = (p: TurnPriority) =>
  p.toUpperCase().replace("-", "_") as "ARRIVED" | "PHYSICAL" | "IN_TRANSIT" | "REGISTERED";

const toSourceEnum = (s: TurnSource) =>
  s.toUpperCase() as "APP" | "MANUAL" | "QR" | "WEB" | "PHONE";

export class PostgresTurnRepo implements ITurnRepo {
  public async findById(id: string): Promise<Turn | null> {
    const row = await prisma.turn.findUnique({ where: { id } });
    return row ? toTurn(row) : null;
  }

  public async createWithNextNumber(data: CreateTurnData): Promise<Turn> {
    return prisma.$transaction(async (tx) => {
      // Lock the queue row to serialize concurrent turn creation for the same queue
      await tx.$queryRaw`SELECT id FROM queues WHERE id = ${data.queueId} FOR UPDATE`;

      const count = await tx.turn.count({
        where: { queueId: data.queueId, turnDate: data.turnDate },
      });

      const number = count + 1;
      const displayNumber = `${data.prefix}-${String(number).padStart(3, "0")}`;

      const row = await tx.turn.create({
        data: {
          id: randomUUID(),
          queueId: data.queueId,
          businessId: data.businessId,
          customerId: data.customerId ?? null,
          guestName: data.guestName ?? null,
          phone: data.phone ?? null,
          number,
          displayNumber,
          status: "WAITING",
          priority: toPriorityEnum(data.priority),
          source: toSourceEnum(data.source),
          turnDate: data.turnDate,
          queueJoinedAt: data.queueJoinedAt,
        },
      });

      return toTurn(row);
    });
  }

  public async findNextWaitingTurn(queueId: string): Promise<Turn | null> {
    const PRIORITY_RANK: Record<string, number> = {
      ARRIVED: 1, PHYSICAL: 2, IN_TRANSIT: 3, REGISTERED: 4,
    };
    const rows = await prisma.turn.findMany({
      // A phone reservation with a future queueJoinedAt hasn't "arrived" yet
      // — calling it before its ETA would summon someone who was told they
      // didn't need to be there.
      where: { queueId, status: "WAITING", queueJoinedAt: { lte: new Date() } },
      orderBy: { queueJoinedAt: "asc" },
    });
    const sorted = rows.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const byJoin = a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();
      return byJoin !== 0 ? byJoin : a.number - b.number;
    });
    return sorted[0] ? toTurn(sorted[0]) : null;
  }

  public async hasPendingReservation(queueId: string): Promise<boolean> {
    const row = await prisma.turn.findFirst({
      where: { queueId, status: "WAITING", queueJoinedAt: { gt: new Date() } },
      select: { id: true },
    });
    return row !== null;
  }

  public async findCalledTurnByQueue(queueId: string): Promise<Turn | null> {
    const row = await prisma.turn.findFirst({
      where: { queueId, status: "CALLED" },
    });
    return row ? toTurn(row) : null;
  }

  public async findActiveByCustomerInAnyBusiness(customerId: string): Promise<Turn | null> {
    const row = await prisma.turn.findFirst({
      where: {
        customerId,
        status: { in: ["WAITING", "CALLED", "ATTENDING", "REDIRECTED"] },
      },
    });
    return row ? toTurn(row) : null;
  }

  public async findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null> {
    const row = await prisma.turn.findFirst({
      where: {
        customerId,
        queueId,
        status: { in: ["WAITING", "CALLED", "ATTENDING", "REDIRECTED"] },
      },
    });
    return row ? toTurn(row) : null;
  }

  public async findAttendingByServiceWindow(serviceWindowId: string): Promise<Turn | null> {
    // "REDIRECTED" is included alongside "ATTENDING": a turn sent to this
    // window is already claiming it even before staff taps to start
    // attending, so the window must be treated as occupied for both the
    // conflict check in AttendTurnUseCase and the delete/toggle guards.
    const row = await prisma.turn.findFirst({
      where: { serviceWindowId, status: { in: ["ATTENDING", "REDIRECTED"] } },
    });
    return row ? toTurn(row) : null;
  }

  public async getPlatformTurnCounts(fromDate: Date, toDate: Date): Promise<PlatformTurnCounts> {
    const [completed, cancelled] = await Promise.all([
      prisma.turn.count({ where: { turnDate: { gte: fromDate, lte: toDate }, status: "COMPLETED" } }),
      prisma.turn.count({ where: { turnDate: { gte: fromDate, lte: toDate }, status: "CANCELLED" } }),
    ]);
    return { completed, cancelled };
  }

  public async getTurnCountsByBusiness(fromDate: Date, toDate: Date): Promise<BusinessTurnCount[]> {
    const rows = await prisma.turn.groupBy({
      by: ["businessId"],
      where: { turnDate: { gte: fromDate, lte: toDate } },
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ businessId: row.businessId, turnCount: row._count._all }))
      .sort((a, b) => b.turnCount - a.turnCount);
  }

  // Intentionally counts future-dated reservations too — see ITurnRepo.
  public async countWaitingAhead(queueId: string, queueJoinedAt: Date, turnNumber: number, priority: TurnPriority): Promise<number> {
    const PRIORITY_ORDER = ["ARRIVED", "PHYSICAL", "IN_TRANSIT", "REGISTERED"] as const;
    const priorityEnum = toPriorityEnum(priority);
    const myRank = PRIORITY_ORDER.indexOf(priorityEnum);
    const higherPriorities = PRIORITY_ORDER.slice(0, myRank);

    const countHigher = higherPriorities.length > 0
      ? prisma.turn.count({
          where: { queueId, status: "WAITING", priority: { in: [...higherPriorities] } },
        })
      : Promise.resolve(0);

    const countSame = prisma.turn.count({
      where: {
        queueId, status: "WAITING", priority: priorityEnum,
        OR: [
          { queueJoinedAt: { lt: queueJoinedAt } },
          { queueJoinedAt, number: { lt: turnNumber } },
        ],
      },
    });

    const [ahead, sameAhead] = await Promise.all([countHigher, countSame]);
    return ahead + sameAhead;
  }

  public async getAverageServiceMinutes(queueId: string, turnDate: Date): Promise<number | null> {
    const sevenDaysAgo = new Date(turnDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const rows = await prisma.turn.findMany({
      where: {
        queueId,
        turnDate: { gte: sevenDaysAgo, lte: turnDate },
        status: "COMPLETED",
        startedAttentionAt: { not: null },
        attendedAt: { not: null },
      },
      select: { startedAttentionAt: true, attendedAt: true },
    });
    if (rows.length === 0) return null;
    const total = rows.reduce(
      (sum, row) => sum + (row.attendedAt!.getTime() - row.startedAttentionAt!.getTime()) / 60_000,
      0,
    );
    return total / rows.length;
  }

  // Intentionally includes future-dated reservations too — see ITurnRepo.
  public async findActiveByQueue(queueId: string): Promise<ActiveTurnSummary[]> {
    const PRIORITY_RANK: Record<string, number> = {
      ARRIVED: 1, PHYSICAL: 2, IN_TRANSIT: 3, REGISTERED: 4,
    };
    const rows = await prisma.turn.findMany({
      where: { queueId, status: { in: ["WAITING", "CALLED", "ATTENDING", "REDIRECTED"] } },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { queueJoinedAt: "asc" },
    });
    rows.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const byJoin = a.queueJoinedAt.getTime() - b.queueJoinedAt.getTime();
      return byJoin !== 0 ? byJoin : a.number - b.number;
    });
    return rows.map((row) => ({
      turnId: row.id,
      displayNumber: row.displayNumber,
      customerName: row.customer
        ? `${row.customer.firstName} ${row.customer.lastName}`.trim()
        : null,
      guestName: row.guestName ?? null,
      phone: row.phone ?? null,
      source: row.source.toLowerCase() as TurnSource,
      priority: row.priority.toLowerCase().replace("_", "-") as TurnPriority,
      status: row.status.toLowerCase() as "waiting" | "called" | "attending" | "redirected",
      createdAt: row.createdAt,
      queueJoinedAt: row.queueJoinedAt,
      serviceWindowId: row.serviceWindowId ?? null,
      startedAttentionAt: row.startedAttentionAt ?? null,
    }));
  }

  public async findRecentCalls(queueId: string, limit: number): Promise<RecentCallItem[]> {
    const rows = await prisma.turn.findMany({
      where: { queueId, calledAt: { not: null } },
      include: { serviceWindow: { select: { name: true } } },
      orderBy: { calledAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      turnId: row.id,
      displayNumber: row.displayNumber,
      serviceWindowId: row.serviceWindowId ?? null,
      serviceWindowName: row.serviceWindow?.name ?? null,
      calledAt: row.calledAt!,
    }));
  }

  public async getRawMetricsByDate(queueId: string, date: Date): Promise<TurnDayRaw> {
    const [completedRows, cancelledCount, noShowCount] = await Promise.all([
      prisma.turn.findMany({
        where: { queueId, turnDate: date, status: "COMPLETED", startedAttentionAt: { not: null }, attendedAt: { not: null } },
        select: { startedAttentionAt: true, attendedAt: true },
      }),
      prisma.turn.count({ where: { queueId, turnDate: date, status: "CANCELLED" } }),
      prisma.turn.count({ where: { queueId, turnDate: date, status: "NO_SHOW" } }),
    ]);
    return {
      completedTurns: completedRows.map((r) => ({ startedAttentionAt: r.startedAttentionAt!, attendedAt: r.attendedAt! })),
      cancelledCount,
      noShowCount,
    };
  }

  public async findHistoryByQueue(queueId: string, date: Date): Promise<TurnHistoryItem[]> {
    // Includes cancelled/no-show turns alongside completed ones — the day's
    // history should be traceable in full, not just the successful path. A
    // cancelled or no-show turn may never have been called (calledAt null,
    // e.g. cancelled while still waiting), so waitMinutes is only computed
    // when there's a calledAt to measure against.
    const rows = await prisma.turn.findMany({
      where: {
        queueId,
        turnDate: date,
        status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      turnId:        row.id,
      displayNumber: row.displayNumber,
      customerName:  row.customer ? `${row.customer.firstName} ${row.customer.lastName}`.trim() : null,
      guestName:     row.guestName ?? null,
      source:        row.source.toLowerCase() as TurnSource,
      priority:      row.priority.toLowerCase().replace("_", "-") as TurnPriority,
      status:        row.status.toLowerCase() as "completed" | "cancelled" | "no_show",
      createdAt:     row.createdAt,
      calledAt:      row.calledAt,
      attendedAt:    row.attendedAt,
      cancelledAt:   row.cancelledAt,
      noShowAt:      row.noShowAt,
      waitMinutes:   row.calledAt ? Math.round((row.calledAt.getTime() - row.createdAt.getTime()) / 60_000) : null,
    }));
  }

  public async save(entity: Turn): Promise<Turn> {
    const row = await prisma.turn.update({
      where: { id: entity.id },
      data: {
        status: entity.status.toUpperCase() as "WAITING" | "CALLED" | "ATTENDING" | "REDIRECTED" | "CANCELLED" | "COMPLETED" | "NO_SHOW",
        serviceWindowId: entity.serviceWindowId ?? null,
        calledAt: entity.calledAt ?? null,
        startedAttentionAt: entity.startedAttentionAt ?? null,
        attendedAt: entity.attendedAt ?? null,
        cancelledAt: entity.cancelledAt ?? null,
        noShowAt: entity.noShowAt ?? null,
      },
    });
    return toTurn(row);
  }
}
