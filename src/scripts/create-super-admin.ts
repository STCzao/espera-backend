import "dotenv/config";

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

import bcrypt from "bcryptjs";

import { prisma } from "@shared/infrastructure/prisma";

/**
 * Prompts on the current TTY with the typed characters suppressed, so the
 * password never gets echoed to the terminal. `readline`'s public API has no
 * mask option, so this leans on the documented-but-internal
 * `_writeToOutput` hook (the same trick most zero-dependency Node CLI
 * password prompts use) to swallow everything except the question itself.
 */
const promptHiddenInput = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const rlInternals = rl as unknown as { _writeToOutput: (text: string) => void };
    const originalWrite = rlInternals._writeToOutput.bind(rl);
    rlInternals._writeToOutput = (text: string) => {
      if (text.startsWith(question)) originalWrite(text);
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });

/**
 * One-off bootstrap for the first Backoffice account (HU-8.1). There is no
 * self-registration for super_admin — credentials are created internally by
 * the team, run once per environment.
 *
 * Usage:
 *   npm run create:super-admin -- <email> <firstName> <lastName>
 * The password is never a CLI argument (it would land in shell history and
 * be readable via `ps`/`/proc/<pid>/cmdline` while the script runs) — it's
 * either read from SUPER_ADMIN_PASSWORD (for scripted/CI use) or prompted
 * for interactively with the input hidden.
 *
 * Idempotent: running it again for an existing email just promotes that
 * user to super_admin instead of failing.
 */
async function main() {
  const [email, firstName, lastName] = process.argv.slice(2);

  if (!email || !firstName || !lastName) {
    console.error("Usage: npm run create:super-admin -- <email> <firstName> <lastName>");
    process.exit(1);
  }

  const password =
    process.env.SUPER_ADMIN_PASSWORD ?? (await promptHiddenInput("Password: "));

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
