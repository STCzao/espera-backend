import { prisma } from "@shared/infrastructure/prisma";
import type { Queue } from "../domain/Queue";
import type { IQueueRepo } from "../domain/IQueueRepo";

const toQueue = (raw: {
  id: string;
  businessId: string;
  name: string;
  prefix: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Queue => ({
  id: raw.id,
  businessId: raw.businessId,
  name: raw.name,
  prefix: raw.prefix,
  isActive: raw.isActive,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

export class PostgresQueueRepo implements IQueueRepo {
  public async findById(id: string): Promise<Queue | null> {
    const row = await prisma.queue.findUnique({ where: { id } });
    return row ? toQueue(row) : null;
  }

  public async findByBusinessId(businessId: string): Promise<Queue[]> {
    const rows = await prisma.queue.findMany({ where: { businessId } });
    return rows.map(toQueue);
  }

  public async findActiveByBusinessId(businessId: string): Promise<Queue | null> {
    const row = await prisma.queue.findFirst({
      where: { businessId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    return row ? toQueue(row) : null;
  }

  public async save(entity: Queue): Promise<Queue> {
    const data = {
      businessId: entity.businessId,
      name: entity.name,
      prefix: entity.prefix,
      isActive: entity.isActive,
    };
    const row = await prisma.queue.upsert({
      where: { id: entity.id },
      create: { id: entity.id, ...data },
      update: data,
    });
    return toQueue(row);
  }
}
