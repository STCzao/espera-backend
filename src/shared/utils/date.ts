/**
 * Midnight UTC for the current instant — the day boundary every
 * date-scoped query in the app (turn history, metrics, wait estimates)
 * filters against, regardless of the server's or a business's local
 * timezone.
 */
export const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
