import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "@shared/infrastructure/prisma";

/**
 * One-off bootstrap for the first Backoffice account (HU-8.1). There is no
 * self-registration for super_admin — credentials are created internally by
 * the team, run once per environment.
 *
 * Usage:
 *   npm run create:super-admin -- <email> <password> <firstName> <lastName>
 *
 * Idempotent: running it again for an existing email just promotes that
 * user to super_admin instead of failing.
 */
async function main() {
  const [email, password, firstName, lastName] = process.argv.slice(2);

  if (!email || !password || !firstName || !lastName) {
    console.error("Usage: npm run create:super-admin -- <email> <password> <firstName> <lastName>");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "SUPER_ADMIN", approvalStatus: "APPROVED", isEmailVerified: true, passwordHash },
    });
    console.log(`Promoted existing user ${email} to super_admin.`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: email.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
      role: "SUPER_ADMIN",
      approvalStatus: "APPROVED",
      authProvider: "LOCAL",
      isEmailVerified: true,
    },
  });

  console.log(`Created super_admin ${user.email} (${user.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
