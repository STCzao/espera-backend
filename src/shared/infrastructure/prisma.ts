import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

import type { TransactionHandle } from "@shared/kernel/Repository";

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"]
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export { prisma };

export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Resolves a repo's optional TransactionHandle back into a real Prisma
 * client: the interactive-transaction client if the caller is running
 * inside PrismaUnitOfWork.run(), or the regular singleton otherwise. Every
 * repo method that wants transaction support calls this instead of
 * referencing `prisma` directly.
 */
export const resolvePrismaClient = (tx?: TransactionHandle): PrismaClient | PrismaTransactionClient =>
  (tx as PrismaTransactionClient | undefined) ?? prisma;
