import { Prisma } from "@prisma/client";

import { generateUniqueSlug } from "@shared/utils/slug";

const isUniqueSlugConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  Array.isArray(error.meta?.target) &&
  (error.meta.target as unknown[]).includes("slug");

/**
 * Wraps generateUniqueSlug() and the caller's actual persist step in one
 * retry loop. generateUniqueSlug's "is this slug free" check and the
 * caller's write aren't atomic — two concurrent registrations for the same
 * name (e.g. "Panadería Norte") can both pass the check before either
 * writes, and `slug` has a DB-level @unique constraint, so the second write
 * throws an unhandled P2002. On that specific conflict (checked via the
 * error's `meta.target`, so an unrelated unique violation from the same
 * trySave — e.g. a duplicate email — still propagates untouched), this
 * regenerates a fresh candidate slug and retries the whole save, instead of
 * the caller surfacing a generic 500 for what's just a legitimate
 * concurrent signup.
 */
export async function withUniqueSlug<T>(
  name: string,
  findBySlug: (slug: string) => Promise<unknown>,
  trySave: (slug: string) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const slug = await generateUniqueSlug(name, findBySlug);
    try {
      return await trySave(slug);
    } catch (error) {
      if (!isUniqueSlugConflict(error)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}
