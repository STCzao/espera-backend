import "dotenv/config";

import { randomUUID } from "node:crypto";

import { prisma } from "@shared/infrastructure/prisma";

async function main() {
  const approved = await prisma.business.findMany({
    where: { status: "APPROVED" },
    select: { id: true, name: true },
  });

  console.log(`Found ${approved.length} approved business(es).`);

  let created = 0;
  let skipped = 0;

  for (const business of approved) {
    const existing = await prisma.queue.findFirst({
      where: { businessId: business.id, isActive: true },
      select: { id: true },
    });

    if (existing) {
      console.log(`  [skip]    ${business.name} (${business.id}) — already has queue ${existing.id}`);
      skipped++;
      continue;
    }

    const id = randomUUID();
    await prisma.queue.create({
      data: {
        id,
        businessId: business.id,
        name: "Caja principal",
        prefix: "A",
        isActive: true,
      },
    });

    console.log(`  [created] ${business.name} (${business.id}) → queue ${id}`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, skipped: ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
