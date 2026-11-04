import { formatDate, formatPrice, slugify } from "../format";
import { DIRECTORY_SPORTS, directoryPath, sportLabel, type SportId } from "../sports";
import { stateName, stateSlug } from "../states";
import type { CampSummary } from "../types";

/**
 * SEO hub logic. Everything here is computed from real public listings only:
 * counts, date ranges, host levels and price ranges come straight from the data,
 * and pages with too few listings are kept out of the index (thin-content guard).
 */

/** Sport+state and sport+city hubs are indexable only with at least this many upcoming listings. */
export const MIN_LISTINGS_FOR_INDEXED_HUB = 3;
/** College pages are indexable only with at least this many listings (one camp would duplicate its camp page). */
export const MIN_LISTINGS_FOR_INDEXED_COLLEGE = 2;

export function citySlug(city: string): string {
  return slugify(city);
}

export function isUpcoming(c: Pick<CampSummary, "startDate" | "endDate">, today: string): boolean {
  if (!c.startDate) return true; // dates not announced yet: still a current listing
  return (c.endDate ?? c.startDate) >= today;
}

export function sportStatePath(sport: SportId, state: string): string {
  return `${directoryPath(sport)}/${stateSlug(state)}`;
}
export function sportCityPath(sport: SportId, state: string, city: string): string {
  return `${sportStatePath(sport, state)}/${citySlug(city)}`;
}
export function collegePath(slug: string): string {
  return `/colleges/${slug}`;
}

export interface HubLink { path: string; label: string; count: number }

export interface HubIndex {
  today: string;
  /** All public listings (published + cancelled), past included. */
  all: CampSummary[];
  /** Public, upcoming, not cancelled — what hub pages list and count. */
  upcoming: CampSummary[];
}

export function buildHubIndex(all: CampSummary[], today: string): HubIndex {
  const pub = all.filter((c) => !c.isSample && (c.status === "published" || c.status === "cancelled"));
  return { today, all: pub, upcoming: pub.filter((c) => c.status === "published" && isUpcoming(c, today)) };
}

export interface HubScope { sport?: SportId; state?: string; city?: string; college?: string }

export function campsInScope(index: HubIndex, s: HubScope, pool: CampSummary[] = index.upcoming): CampSummary[] {
  return pool.filter((c) =>
    (!s.sport || c.sport === s.sport) &&
    (!s.state || c.state === s.state) &&
    (!s.city || (c.city != null && citySlug(c.city) === s.city)) &&
    (!s.college || c.institutionSlug === s.college));
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const byCountDesc = <T extends { count: number; label: string }>(a: T, b: T) => b.count - a.count || a.label.localeCompare(b.label);

export function sportHubs(index: HubIndex): HubLink[] {
  return DIRECTORY_SPORTS.map((s) => ({ path: directoryPath(s), label: `${sportLabel(s)} camps`, count: campsInScope(index, { sport: s }).length }));
}

/** Indexable sport+state hubs (optionally for one sport). */
export function stateHubs(index: HubIndex, sport?: SportId): (HubLink & { sport: SportId; state: string })[] {
  const out: (HubLink & { sport: SportId; state: string })[] = [];
  for (const s of sport ? [sport] : DIRECTORY_SPORTS) {
    for (const [state, count] of countBy(campsInScope(index, { sport: s }), (c) => c.state)) {
      if (count >= MIN_LISTINGS_FOR_INDEXED_HUB && stateName(state)) {
        out.push({ sport: s, state, count, path: sportStatePath(s, state), label: `${sportLabel(s)} camps in ${stateName(state)}` });
      }
    }
  }
  return out.sort(byCountDesc);
}

/** Indexable sport+city hubs. */
export function cityHubs(index: HubIndex, sport?: SportId, state?: string): (HubLink & { sport: SportId; state: string; city: string })[] {
  const out: (HubLink & { sport: SportId; state: string; city: string })[] = [];
  for (const s of sport ? [sport] : DIRECTORY_SPORTS) {
    const pool = campsInScope(index, { sport: s, state });
    const names = new Map<string, string>();
    pool.forEach((c) => c.city && c.state && names.set(`${c.state}|${citySlug(c.city)}`, c.city));
    for (const [key, count] of countBy(pool, (c) => (c.city && c.state ? `${c.state}|${citySlug(c.city)}` : null))) {
      const [st] = key.split("|");
      const city = names.get(key)!;
      if (count >= MIN_LISTINGS_FOR_INDEXED_HUB && stateName(st)) {
        out.push({ sport: s, state: st, city, count, path: sportCityPath(s, st, city), label: `${sportLabel(s)} camps in ${city}, ${st}` });
      }
    }
  }
  return out.sort(byCountDesc);
}

/** College pages with listings. `indexableOnly` keeps the ones with enough listings to stand alone. */
export function collegeHubs(index: HubIndex, opts: { sport?: SportId; indexableOnly?: boolean } = {}): (HubLink & { slug: string; name: string })[] {
  const pool = opts.sport ? campsInScope(index, { sport: opts.sport }) : index.upcoming;
  const names = new Map<string, string>();
  pool.forEach((c) => c.institutionSlug && c.institutionName && names.set(c.institutionSlug, c.institutionName));
  const out = [...countBy(pool, (c) => (c.institutionName ? c.institutionSlug : null))]
    .map(([slug, count]) => ({ slug, name: names.get(slug)!, count, path: collegePath(slug), label: names.get(slug)! }))
    .filter((c) => !opts.indexableOnly || c.count >= MIN_LISTINGS_FOR_INDEXED_COLLEGE);
  return out.sort(byCountDesc);
}

const EVENT_PLURAL: Record<string, [string, string]> = {
  prospect_camp: ["prospect camp", "prospect camps"], id_camp: ["ID camp", "ID camps"], showcase: ["showcase", "showcases"],
  clinic: ["clinic", "clinics"], combine: ["combine", "combines"], elite_camp: ["elite camp", "elite camps"],
  tournament: ["tournament", "tournaments"], other: ["other event", "other events"],
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "2026–27" style season label from the listings' real start dates, or "" when none have dates. */
export function seasonLabel(camps: Pick<CampSummary, "startDate">[]): string {
  const years = camps.map((c) => c.startDate?.slice(0, 4)).filter((y): y is string => !!y).sort();
  if (!years.length) return "";
  const a = years[0], b = years[years.length - 1];
  return a === b ? a : `${a}–${b.slice(2)}`;
}

/**
 * Short, factual intro generated from the listings: counts, date range, event mix,
 * host program levels (as listed by the organizer), price range and top locations.
 * Never adds anything the data doesn't say.
 */
export function hubIntro(camps: CampSummary[], opts: { noun: string; where?: string; showCities?: boolean; showStates?: boolean }): string[] {
  const n = camps.length;
  if (!n) return [];
  const out: string[] = [];
  const dated = camps.map((c) => c.startDate).filter((d): d is string => !!d).sort();
  const lastDates = camps.map((c) => c.endDate ?? c.startDate).filter((d): d is string => !!d).sort();
  const range = dated.length ? `, with dates from ${formatDate(dated[0])} to ${formatDate(lastDates[lastDates.length - 1])}` : "";
  out.push(`Camp Check lists ${n} upcoming ${n === 1 ? opts.noun.replace(/s$/, "") : opts.noun}${opts.where ? ` ${opts.where}` : ""}${range}.`);

  const types = [...countBy(camps, (c) => c.eventType)].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (types.length > 1) out.push(`That includes ${list(types.map(([t, k]) => `${k} ${(EVENT_PLURAL[t] ?? EVENT_PLURAL.other)[k === 1 ? 0 : 1]}`))}.`);

  const hosted = camps.filter((c) => c.institutionName);
  const levels = [...countBy(hosted, (c) => (c.association ? `${c.association}${c.division ? ` ${c.division}` : ""}` : null))].sort((a, b) => b[1] - a[1]);
  if (hosted.length) {
    const lvl = levels.length ? ` (${list(levels.map(([l, k]) => `${l}: ${k}`))}, as listed)` : "";
    const indep = n - hosted.length;
    out.push(`${hosted.length} ${hosted.length === 1 ? "is" : "are"} hosted by college programs${lvl}${indep ? `; ${indep} ${indep === 1 ? "is" : "are"} run by independent organizers, clubs or showcase companies` : ""}.`);
  }

  const priced = camps.map((c) => c.priceCents).filter((p): p is number => p != null).sort((a, b) => a - b);
  if (priced.length) {
    const unpriced = n - priced.length;
    const span = priced[0] === priced[priced.length - 1] ? `Posted cost is ${formatPrice(priced[0])}` : `Posted costs range from ${formatPrice(priced[0])} to ${formatPrice(priced[priced.length - 1])}`;
    out.push(`${span}${unpriced ? `; ${unpriced} ${unpriced === 1 ? "listing has" : "listings have"} not posted a price yet` : ""}.`);
  }

  if (opts.showStates) {
    const states = [...countBy(camps, (c) => c.state)].sort((a, b) => b[1] - a[1]).filter(([, k]) => k >= 2).slice(0, 3);
    if (states.length) out.push(`Most listings are in ${list(states.map(([s, k]) => `${stateName(s) || s} (${k})`))}.`);
  }
  if (opts.showCities) {
    const cities = [...countBy(camps, (c) => c.city)].sort((a, b) => b[1] - a[1]).filter(([, k]) => k >= 2).slice(0, 3);
    if (cities.length) out.push(`The most listings are in ${list(cities.map(([s, k]) => `${s} (${k})`))}.`);
  }
  return out;
}

/** Meta description from the same facts, kept to ~155 chars. */
export function hubDescription(camps: CampSummary[], lead: string): string {
  const n = camps.length;
  const dated = camps.map((c) => c.startDate).filter((d): d is string => !!d).sort();
  const priced = camps.map((c) => c.priceCents).filter((p): p is number => p != null).sort((a, b) => a - b);
  const bits = [`${lead}: ${n} upcoming ${n === 1 ? "event" : "events"}`];
  if (dated.length) bits.push(`${formatDate(dated[0])}–${formatDate(dated[dated.length - 1])}`);
  if (priced.length > 1 && priced[0] !== priced[priced.length - 1]) bits.push(`${formatPrice(priced[0])}–${formatPrice(priced[priced.length - 1])}`);
  return truncate(`${bits.join(", ")}. Compare dates, costs, ages and host programs.`, 158);
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).replace(/[\s,;:.–-]+\S*$/, "")}…`;
}

/** Related listings for a camp page: same college, then same sport+state, then same sport. */
export function relatedCamps(index: HubIndex, camp: CampSummary, limit = 6): CampSummary[] {
  const seen = new Set([camp.id]);
  const out: CampSummary[] = [];
  const take = (pool: CampSummary[]) => {
    for (const c of pool) {
      if (out.length >= limit) return;
      if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  };
  if (camp.institutionSlug) take(campsInScope(index, { college: camp.institutionSlug }));
  if (camp.state) take(campsInScope(index, { sport: camp.sport, state: camp.state }));
  take(campsInScope(index, { sport: camp.sport }));
  return out;
}
