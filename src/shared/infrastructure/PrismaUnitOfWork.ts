import type { IUnitOfWork } from "@shared/kernel/UnitOfWork";
import type { TransactionHandle } from "@shared/kernel/Repository";
import { prisma } from "./prisma";

export class PrismaUnitOfWork implements IUnitOfWork {
  public async run<T>(work: (tx: TransactionHandle) => Promise<T>): Promise<T> {
    // Prisma's 5s interactive-transaction default is too tight for work that
    // fans out with the size of the data (e.g. suspending a business cancels
    // every active turn one write at a time): hitting it rolls everything back.
    return prisma.$transaction((tx) => work(tx), { maxWait: 10_000, timeout: 30_000 });
  }
}
