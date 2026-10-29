import { formatDateRange, formatPrice, locationLabel } from "../format";
import { ratingDisplay, MIN_REVIEWS_FOR_ESTABLISHED } from "../ratings";
import { eventTypeLabel } from "../sports";
import { approxMilesBetweenStates } from "../states";
import type { CampDetail, PublicExternalReview, ResearchSummary } from "../types";

/** Every comparison cell says what kind of information it is. */
export type CellKind = "verified" | "advertised" | "opinion" | "research" | "missing" | "estimate";

export interface CompareCell { text: string; kind: CellKind }
export interface CompareRow { label: string; cells: CompareCell[] }

const factKind = (c: CampDetail): CellKind => (c.verificationStatus === "verified" ? "verified" : "advertised");

export function buildComparison(camps: CampDetail[], opts: {
  homeState?: string | null;
  external?: Record<string, PublicExternalReview[]>;
  research?: Record<string, ResearchSummary | null>;
  advanced: boolean;
}): { rows: CompareRow[]; tradeoffs: string[] } {
  const rows: CompareRow[] = [];
  const row = (label: string, f: (c: CampDetail) => CompareCell) => rows.push({ label, cells: camps.map(f) });

  row("Price", (c) => (c.priceCents == null ? { text: "Not published", kind: "missing" } : { text: formatPrice(c.priceCents, c.priceNotes), kind: factKind(c) }));
  row("Dates", (c) => (c.startDate ? { text: formatDateRange(c.startDate, c.endDate), kind: factKind(c) } : { text: "Not announced", kind: "missing" }));
  row("Location", (c) => ({ text: locationLabel(c.city, c.state), kind: c.state ? factKind(c) : "missing" }));
  row("Format", (c) => ({ text: eventTypeLabel(c.eventType), kind: factKind(c) }));
  row("School level", (c) =>
    c.association && c.classificationVerified
      ? { text: `${c.association}${c.division ? ` ${c.division}` : ""}`, kind: "verified" }
      : c.institutionName ? { text: "Not verified", kind: "missing" } : { text: "Independent event", kind: "advertised" });
  row("Coaching exposure claims", (c) => {
    const v = c.participatingColleges.filter((x) => x.verified).length;
    const a = c.participatingColleges.length - v;
    if (!v && !a) return { text: "None listed", kind: "missing" };
    if (v) return { text: `${v} verified college${v > 1 ? "s" : ""}${a ? ` + ${a} advertised` : ""}`, kind: "verified" };
    return { text: `${a} college${a > 1 ? "s" : ""} advertised (unverified)`, kind: "advertised" };
  });
  row("Community rating", (c) => {
    const d = ratingDisplay(c.stats);
    return d.kind === "none" ? { text: "No reviews yet", kind: "missing" } : { text: d.label, kind: "opinion" };
  });
  row("Review volume", (c) => ({ text: `${c.stats.reviewCount} (${c.stats.verifiedCount} verified attendance)`, kind: c.stats.reviewCount ? "opinion" : "missing" }));
  if (opts.homeState) {
    row("Travel (estimate)", (c) => {
      const m = c.state ? approxMilesBetweenStates(opts.homeState!, c.state) : null;
      return m == null ? { text: "Unknown", kind: "missing" } : { text: m === 0 ? "In-state" : `~${m} mi state-to-state`, kind: "estimate" };
    });
  }
  if (opts.advanced) {
    row("External research", (c) => {
      const n = opts.external?.[c.id]?.length ?? 0;
      return n ? { text: `${n} external source${n > 1 ? "s" : ""}`, kind: "advertised" } : { text: "None found", kind: "missing" };
    });
    row("Research summary", (c) => {
      const r = opts.research?.[c.id];
      return r ? { text: r.summary, kind: "research" } : { text: "Not yet available", kind: "missing" };
    });
  }
  return { rows, tradeoffs: tradeoffs(camps, opts.homeState ?? null) };
}

/** Concise, factual tradeoffs. Never claims recruiting outcomes. */
export function tradeoffs(camps: CampDetail[], homeState: string | null): string[] {
  if (camps.length < 2) return [];
  const out: string[] = [];
  const priced = camps.filter((c) => c.priceCents != null);
  if (priced.length >= 2) {
    const sorted = [...priced].sort((a, b) => a.priceCents! - b.priceCents!);
    const diff = sorted[sorted.length - 1].priceCents! - sorted[0].priceCents!;
    if (diff > 0) out.push(`${sorted[0].name} is the lowest advertised price, ${formatPrice(diff)} less than ${sorted[sorted.length - 1].name}.`);
  }
  const unpriced = camps.filter((c) => c.priceCents == null);
  if (unpriced.length) out.push(`${unpriced.map((c) => c.name).join(" and ")} ${unpriced.length > 1 ? "have" : "has"} no published price.`);
  const established = camps.filter((c) => c.stats.reviewCount >= MIN_REVIEWS_FOR_ESTABLISHED);
  if (established.length >= 2) {
    const best = [...established].sort((a, b) => (b.stats.avgOverall ?? 0) - (a.stats.avgOverall ?? 0))[0];
    out.push(`${best.name} has the highest community rating among camps with ${MIN_REVIEWS_FOR_ESTABLISHED}+ reviews.`);
  } else if (camps.every((c) => c.stats.reviewCount === 0)) {
    out.push("None of these camps has community reviews yet, so ratings can't be compared.");
  } else {
    out.push("Review volume is low, so treat rating differences as early signals.");
  }
  const withVerified = camps.filter((c) => c.participatingColleges.some((x) => x.verified));
  if (withVerified.length && withVerified.length < camps.length) {
    out.push(`Only ${withVerified.map((c) => c.name).join(", ")} ${withVerified.length > 1 ? "have" : "has"} verified college attendance.`);
  }
  if (homeState) {
    const near = camps
      .map((c) => ({ c, m: c.state ? approxMilesBetweenStates(homeState, c.state) : null }))
      .filter((x) => x.m != null)
      .sort((a, b) => a.m! - b.m!);
    if (near.length >= 2 && near[near.length - 1].m! - near[0].m! > 200) {
      out.push(`${near[0].c.name} is the closest option; ${near[near.length - 1].c.name} would add roughly ${near[near.length - 1].m! - near[0].m!} more miles each way.`);
    }
  }
  out.push("Advertised college attendance and exposure are not guarantees of recruiting outcomes.");
  return out;
}
