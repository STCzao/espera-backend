import type { TransactionHandle } from "./Repository";

/**
 * Lets a use case run several repo.save() calls atomically without knowing
 * about Prisma (or any other persistence tech): it gets a TransactionHandle
 * to thread through each save() call, and either every write commits or none
 * do. Use whenever a use case's own multi-step write needs "all or nothing"
 * (see PrismaUnitOfWork for the real implementation, and unitOfWorkFakes.ts
 * for the in-memory test double).
 */
export interface IUnitOfWork {
  run<T>(work: (tx: TransactionHandle) => Promise<T>): Promise<T>;
}
