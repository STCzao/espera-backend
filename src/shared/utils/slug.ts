export function toBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

export async function generateUniqueSlug(
  name: string,
  findBySlug: (slug: string) => Promise<unknown>,
): Promise<string> {
  const base = toBaseSlug(name);

  if (!(await findBySlug(base))) return base;

  for (let i = 2; i <= 10; i++) {
    const candidate = `${base}-${i}`;
    if (!(await findBySlug(candidate))) return candidate;
  }

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
