/**
 * Express query params ({@link Request.query}) reach the controller typed as
 * `unknown` per key (a stray `?foo=a&foo=b` makes it an array, for
 * instance) — every controller in this codebase reads an optional string or
 * number out of one the same way. Centralized so the coercion behavior
 * (in particular: a garbage numeric value becomes `undefined`, never `NaN`)
 * can't drift between call sites.
 */
export const asQueryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const asQueryNumber = (value: unknown): number | undefined => {
  const raw = asQueryString(value);
  // Number("") and Number("  ") are 0, not NaN — an empty param must read as
  // "absent", not as the number zero.
  if (raw === undefined || raw.trim() === "") return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};
