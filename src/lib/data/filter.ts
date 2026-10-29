import { rankingScore } from "../ratings";
import { todayISO, type SearchFilters } from "../search";
import type { CampSummary } from "../types";

/** In-memory implementation of directory filtering/sorting (sample mode + tests). Mirrors the SQL path. */
export function filterAndSortCamps(camps: CampSummary[], f: SearchFilters, now = new Date()) {
  const today = todayISO(now);
  const terms = (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  let out = camps.filter((c) => {
    if (c.status !== "published" && c.status !== "cancelled") return false;
    if (f.sport && c.sport !== f.sport) return false;
    if (f.state && c.state !== f.state) return false;
    if (f.college) {
      const col = f.college.toLowerCase();
      if (!(c.institutionName ?? "").toLowerCase().includes(col) && c.institutionSlug !== col) return false;
    }
    if (f.association && (c.association !== f.association || !c.classificationVerified)) return false;
    if (f.division && (c.division !== f.division || !c.classificationVerified)) return false;
    if (f.eventType && c.eventType !== f.eventType) return false;
    if (f.minPrice != null && (c.priceCents == null || c.priceCents < f.minPrice * 100)) return false;
    if (f.maxPrice != null && (c.priceCents == null || c.priceCents > f.maxPrice * 100)) return false;
    if (!f.includePast && c.startDate && (c.endDate ?? c.startDate) < today) return false;
    if (f.from && (!c.startDate || c.startDate < f.from)) return false;
    if (f.to && (!c.startDate || c.startDate > f.to)) return false;
    if (f.minRating != null && (c.stats.reviewCount === 0 || (c.stats.avgOverall ?? 0) < f.minRating)) return false;
    if (f.minReviews != null && c.stats.reviewCount < f.minReviews) return false;
    if (terms.length) {
      const hay = [c.name, c.institutionName, c.organizerName, c.city, c.state, c.sport, c.eventType]
        .filter(Boolean).join(" ").toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const byDate = (a: CampSummary, b: CampSummary) =>
    (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999");
  const sorters: Record<string, (a: CampSummary, b: CampSummary) => number> = {
    date: byDate,
    relevance: (a, b) => relevance(b, terms) - relevance(a, terms) || byDate(a, b),
    price_low: (a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity) || byDate(a, b),
    price_high: (a, b) => (b.priceCents ?? -1) - (a.priceCents ?? -1) || byDate(a, b),
    rating: (a, b) => rankingScore(b.stats) - rankingScore(a.stats) || byDate(a, b),
    reviews: (a, b) => b.stats.reviewCount - a.stats.reviewCount || byDate(a, b),
  };
  out = [...out].sort(sorters[f.sort] ?? byDate);
  const total = out.length;
  const start = (f.page - 1) * f.pageSize;
  return { items: out.slice(start, start + f.pageSize), total };
}

function relevance(c: CampSummary, terms: string[]): number {
  if (!terms.length) return 0;
  const name = c.name.toLowerCase();
  const inst = (c.institutionName ?? "").toLowerCase();
  return terms.reduce((s, t) => s + (name.includes(t) ? 3 : 0) + (inst.includes(t) ? 2 : 0), 0);
}
