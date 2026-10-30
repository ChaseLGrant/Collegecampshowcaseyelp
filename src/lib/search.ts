import { z } from "zod";
import { ASSOCIATIONS, EVENT_TYPE_IDS, SPORT_IDS, type SportId } from "./sports";
import { normalizeState } from "./states";

export const SORTS = ["recommended", "relevance", "editorial", "date", "price_low", "price_high", "rating", "reviews"] as const;
export type SortOption = (typeof SORTS)[number];

export interface SearchFilters {
  q?: string;
  sport?: SportId;
  state?: string;
  college?: string;
  association?: string;
  division?: string;
  eventType?: string;
  minPrice?: number; // dollars
  maxPrice?: number; // dollars
  from?: string; // YYYY-MM-DD
  to?: string;
  minRating?: number;
  minReviews?: number;
  includePast?: boolean;
  /** Only Camp Check Editor's Picks. */
  editorsPick?: boolean;
  sort: SortOption;
  page: number;
  pageSize: number;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optNum = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(min).max(max).optional());

const schema = z.object({
  q: z.string().trim().max(120).optional().transform((v) => v || undefined),
  sport: z.enum(SPORT_IDS as [SportId, ...SportId[]]).optional().catch(undefined),
  state: z.string().optional().transform((v) => normalizeState(v) ?? undefined),
  college: z.string().trim().max(120).optional().transform((v) => v || undefined),
  association: z.enum(ASSOCIATIONS).optional().catch(undefined),
  division: z.enum(["D1", "D2", "D3"]).optional().catch(undefined),
  eventType: z.enum(EVENT_TYPE_IDS as [string, ...string[]]).optional().catch(undefined),
  minPrice: optNum(0, 100000).catch(undefined),
  maxPrice: optNum(0, 100000).catch(undefined),
  from: dateStr.optional().catch(undefined),
  to: dateStr.optional().catch(undefined),
  minRating: optNum(1, 5).catch(undefined),
  minReviews: optNum(1, 10000).catch(undefined),
  includePast: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
  editorsPick: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional(),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.preprocess((v) => (v == null || v === "" ? 1 : Number(v)), z.number().int().min(1).max(500)).catch(1),
  pageSize: z.preprocess((v) => (v == null || v === "" ? 24 : Number(v)), z.number().int().min(1).max(60)).catch(24),
});

type ParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function toRecord(params: ParamsLike): Record<string, string | undefined> {
  if (params instanceof URLSearchParams) return Object.fromEntries(params.entries());
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

/**
 * Parses search filters from URL params. Invalid values are dropped rather than
 * causing errors, so a mistyped URL still shows results.
 * `stickySport` is the visitor's remembered sport (cookie) used only when the URL
 * does not mention sport at all. `sport=all` explicitly clears it.
 */
export function parseSearchFilters(params: ParamsLike, stickySport?: string | null): SearchFilters {
  const rec = toRecord(params);
  if (rec.sport === undefined && stickySport && stickySport !== "all") rec.sport = stickySport;
  if (rec.sport === "all") delete rec.sport;
  const parsed = schema.parse(rec) as Omit<SearchFilters, "sort"> & { sort?: SortOption };
  // No sort chosen: keyword searches rank by relevance; browsing uses the default
  // "recommended" order (Editor's Picks, then editor score, then community ranking, then date).
  if (!parsed.sort) parsed.sort = parsed.q ? "relevance" : "recommended";
  if (parsed.minPrice != null && parsed.maxPrice != null && parsed.minPrice > parsed.maxPrice) {
    [parsed.minPrice, parsed.maxPrice] = [parsed.maxPrice, parsed.minPrice];
  }
  if (!parsed.q && parsed.sort === "relevance") parsed.sort = "recommended";
  return parsed as SearchFilters;
}

/** Serializes filters back to a query string (omits defaults). */
export function filtersToQuery(f: Partial<SearchFilters>, overrides: Partial<SearchFilters> = {}): string {
  const merged = { ...f, ...overrides } as Record<string, unknown>;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (k === "page" && v === 1) continue;
    if (k === "pageSize" && v === 24) continue;
    if (k === "sort" && v === (merged.q ? "relevance" : "recommended")) continue;
    qs.set(k, v === true ? "1" : String(v));
  }
  return qs.toString();
}

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
