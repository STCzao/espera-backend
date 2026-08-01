import { prisma } from "@shared/infrastructure/prisma";
import type { ServiceWindow, ServiceWindowType } from "../domain/ServiceWindow";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";

const toServiceWindow = (raw: {
  id: string;
  queueId: string;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ServiceWindow => ({
  id: raw.id,
  queueId: raw.queueId,
  name: raw.name,
  type: raw.type.toLowerCase() as ServiceWindowType,
  isActive: raw.isActive,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const toTypeEnum = (t: ServiceWindowType) =>
  t.toUpperCase() as "CASHIER" | "CUSTOMER_SERVICE" | "INFORMATION" | "ADMIN" | "TECHNICAL";

export class PostgresServiceWindowRepo implements IServiceWindowRepo {
  public async findById(id: string): Promise<ServiceWindow | null> {
    const row = await prisma.serviceWindow.findUnique({ where: { id } });
    return row ? toServiceWindow(row) : null;
  }

  public async findByQueueId(queueId: string): Promise<ServiceWindow[]> {
    const rows = await prisma.serviceWindow.findMany({
      where: { queueId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toServiceWindow);
  }

  public async save(entity: ServiceWindow): Promise<ServiceWindow> {
    const data = {
      queueId:  entity.queueId,
      name:     entity.name,
      type:     toTypeEnum(entity.type),
      isActive: entity.isActive,
    };
    const row = await prisma.serviceWindow.upsert({
      where: { id: entity.id },
      create: { id: entity.id, ...data },
      update: { name: data.name, type: data.type, isActive: data.isActive },
    });
    return toServiceWindow(row);
  }

  public async delete(id: string): Promise<void> {
    await prisma.serviceWindow.delete({ where: { id } });
  }
}
