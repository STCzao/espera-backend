import { randomUUID } from "node:crypto";

import { prisma } from "@shared/infrastructure/prisma";
import type { Turn, TurnPriority, TurnSource, TurnStatus } from "../domain/Turn";
import type { CreateTurnData, ITurnRepo } from "../domain/ITurnRepo";

const toTurn = (raw: {
  id: string;
  queueId: string;
  businessId: string;
  customerId: string | null;
  guestName: string | null;
  number: number;
  displayNumber: string;
  status: string;
  priority: string;
  source: string;
  turnDate: Date;
  calledAt: Date | null;
  attendedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Turn => ({
  id: raw.id,
  queueId: raw.queueId,
  businessId: raw.businessId,
  customerId: raw.customerId ?? undefined,
  guestName: raw.guestName ?? undefined,
  number: raw.number,
  displayNumber: raw.displayNumber,
  status: raw.status.toLowerCase() as TurnStatus,
  priority: raw.priority.toLowerCase().replace("_", "-") as TurnPriority,
  source: raw.source.toLowerCase() as TurnSource,
  turnDate: raw.turnDate,
  calledAt: raw.calledAt ?? undefined,
  attendedAt: raw.attendedAt ?? undefined,
  cancelledAt: raw.cancelledAt ?? undefined,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const toPriorityEnum = (p: TurnPriority) =>
  p.toUpperCase().replace("-", "_") as "ARRIVED" | "PHYSICAL" | "IN_TRANSIT" | "REGISTERED";

const toSourceEnum = (s: TurnSource) =>
  s.toUpperCase() as "APP" | "MANUAL" | "QR" | "WEB";

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
          guestName: null,
          number,
          displayNumber,
          status: "WAITING",
          priority: toPriorityEnum(data.priority),
          source: toSourceEnum(data.source),
          turnDate: data.turnDate,
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
      where: { queueId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
    const sorted = rows.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      return pa !== pb ? pa - pb : a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sorted[0] ? toTurn(sorted[0]) : null;
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
        status: { in: ["WAITING", "CALLED"] },
      },
    });
    return row ? toTurn(row) : null;
  }

  public async findActiveByCustomerInQueue(customerId: string, queueId: string): Promise<Turn | null> {
    const row = await prisma.turn.findFirst({
      where: {
        customerId,
        queueId,
        status: { in: ["WAITING", "CALLED"] },
      },
    });
    return row ? toTurn(row) : null;
  }

  public async countWaitingAhead(queueId: string, turnNumber: number, turnDate: Date): Promise<number> {
    return prisma.turn.count({
      where: {
        queueId,
        turnDate,
        status: "WAITING",
        number: { lt: turnNumber },
      },
    });
  }

  public async save(entity: Turn): Promise<Turn> {
    const row = await prisma.turn.update({
      where: { id: entity.id },
      data: {
        status: entity.status.toUpperCase() as "WAITING" | "CALLED" | "CANCELLED" | "COMPLETED",
        calledAt: entity.calledAt ?? null,
        attendedAt: entity.attendedAt ?? null,
        cancelledAt: entity.cancelledAt ?? null,
      },
    });
    return toTurn(row);
  }
}
