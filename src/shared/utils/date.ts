// Every business in this product operates in Argentina, which has stayed on
// a fixed UTC-3 offset with no DST since 2009 — a plain constant is exact
// and doesn't need a timezone database.
const ARGENTINA_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * The day boundary every date-scoped query in the app (turn history,
 * metrics, wait estimates) filters against, and that new turns get stamped
 * with — expressed as midnight UTC, but for Argentina's calendar day, not
 * the server's. Naively using pure UTC midnight split a single business's
 * operating day in two: a turn taken at 22:00 Argentina time is already
 * 01:00 UTC the next calendar day, so it landed under tomorrow's date while
 * everything earlier that same business day stayed under today's —
 * fragmenting any "today" report run late in the evening.
 */
export const todayUTC = (): Date => {
  const argentinaNow = new Date(Date.now() + ARGENTINA_UTC_OFFSET_MS);
  return new Date(Date.UTC(argentinaNow.getUTCFullYear(), argentinaNow.getUTCMonth(), argentinaNow.getUTCDate()));
};
