import type { IUnitOfWork } from "@shared/kernel/UnitOfWork";
import type { TransactionHandle } from "@shared/kernel/Repository";
import { prisma } from "./prisma";

export class PrismaUnitOfWork implements IUnitOfWork {
  public async run<T>(work: (tx: TransactionHandle) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => work(tx));
  }
}
