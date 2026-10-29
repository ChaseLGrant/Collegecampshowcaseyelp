/** A listing is "stale" if it hasn't been re-verified within this window. */
export const STALE_AFTER_DAYS = 45;

export function verificationStatusFor(lastVerifiedAt: string | null, now = new Date()): "verified" | "unverified" | "stale" {
  if (!lastVerifiedAt) return "unverified";
  const ageDays = (now.getTime() - new Date(lastVerifiedAt).getTime()) / 86400000;
  return ageDays > STALE_AFTER_DAYS ? "stale" : "verified";
}

export function nextRunAt(from: Date, refreshIntervalHours: number, consecutiveFailures: number): Date {
  // Exponential backoff after failures, capped at 7 days.
  const hours = Math.min(refreshIntervalHours * 2 ** Math.min(consecutiveFailures, 4), 24 * 7);
  return new Date(from.getTime() + hours * 3600000);
}
