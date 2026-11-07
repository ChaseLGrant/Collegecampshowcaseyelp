/**
 * Latest of a set of real update timestamps (ISO strings or Dates from the database).
 * Returns undefined when none are valid, so the sitemap omits lastmod rather than inventing one.
 */
export function latestUpdate(values: (string | Date | null | undefined)[]): Date | undefined {
  let best: number | undefined;
  for (const v of values) {
    if (v == null) continue;
    const t = (v instanceof Date ? v : new Date(v)).getTime();
    if (!Number.isNaN(t) && (best === undefined || t > best)) best = t;
  }
  return best === undefined ? undefined : new Date(best);
}
