import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"]
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export { prisma };
