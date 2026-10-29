import { EVENT_TYPE_IDS, isSportId, type EventType, type SportId } from "../sports";
import { normalizeState } from "../states";
import { safeHttpUrl } from "../security/urls";
import type { NormalizedCandidate, RawCandidate } from "./types";

const SPORT_KEYWORDS: [SportId, RegExp][] = [
  ["softball", /\bsoftball\b|\bfastpitch\b/i],
  ["baseball", /\bbaseball\b|\bpitching\b|\bhitting camp\b/i],
  ["football", /\bfootball\b|\bgridiron\b|\b7v7\b|\blinemen\b/i],
  ["basketball", /\bbasketball\b|\bhoops\b/i],
  ["soccer", /\bsoccer\b|\bfutbol\b|\bgoalkeeper\b/i],
  ["volleyball", /\bvolleyball\b|\bbeach volley/i],
  ["lacrosse", /\blacrosse\b|\blax\b/i],
];

/** Classifies sport from an explicit field first, then keywords. Ambiguous → "other" with low confidence. */
export function classifySport(explicit: string | null | undefined, text: string): { sport: SportId; confidence: number } {
  const e = explicit?.trim().toLowerCase();
  if (e) {
    if (isSportId(e)) return { sport: e, confidence: 1 };
    for (const [sport, re] of SPORT_KEYWORDS) if (re.test(e)) return { sport, confidence: 0.95 };
  }
  const hits = SPORT_KEYWORDS.filter(([, re]) => re.test(text)).map(([s]) => s);
  // "softball" text often also mentions baseball facilities; prefer softball when both appear.
  const uniq = [...new Set(hits)];
  if (uniq.length === 1) return { sport: uniq[0], confidence: 0.8 };
  if (uniq.length === 2 && uniq.includes("softball") && uniq.includes("baseball")) return { sport: "softball", confidence: 0.6 };
  if (uniq.length > 1) return { sport: uniq[0], confidence: 0.4 };
  return { sport: "other", confidence: 0.2 };
}

const EVENT_KEYWORDS: [EventType, RegExp][] = [
  ["showcase", /\bshowcase\b/i],
  ["prospect_camp", /\bprospect\b/i],
  ["id_camp", /\bid camp\b|\bidentification camp\b|\bi\.d\. camp\b/i],
  ["combine", /\bcombine\b/i],
  ["elite_camp", /\belite camp\b|\belite\b/i],
  ["tournament", /\btournament\b/i],
  ["clinic", /\bclinic\b/i],
];

export function classifyEventType(explicit: string | null | undefined, text: string): EventType {
  const e = explicit?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (e && (EVENT_TYPE_IDS as string[]).includes(e)) return e as EventType;
  for (const [t, re] of EVENT_KEYWORDS) if (re.test(explicit ?? "") || re.test(text)) return t;
  return "other";
}

/** "$195", "195.00", "USD 195", 195 → 19500. "Free" → 0. Unparseable → null with the raw text kept as a note. */
export function parsePrice(input: string | number | null | undefined): { cents: number | null; notes: string | null } {
  if (input == null || input === "") return { cents: null, notes: null };
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? { cents: Math.round(input * 100), notes: null } : { cents: null, notes: null };
  const t = input.trim();
  if (/^free$/i.test(t) || /^\$?0+(\.0+)?$/.test(t)) return { cents: 0, notes: null };
  const nums = [...t.replace(/,/g, "").matchAll(/(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  if (nums.length === 1 && /^(usd|\$)?\s*\d[\d,]*(\.\d{1,2})?\s*(usd)?$/i.test(t)) return { cents: Math.round(nums[0] * 100), notes: null };
  // Ranges or tiered prices: keep the lowest as the advertised starting price and the text as a note.
  if (nums.length >= 1) return { cents: Math.round(Math.min(...nums) * 100), notes: t.slice(0, 200) };
  return { cents: null, notes: t.slice(0, 200) };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Accepts ISO dates/datetimes, iCal (20260615 / 20260615T090000Z), "June 15, 2026", "6/15/2026". */
export function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return valid(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t);
  if (m) {
    const key = m[1].toLowerCase();
    const mon = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
    if (mon) return valid(+m[3], mon, +m[2]);
  }
  return null;
}

export function cleanText(input: string | null | undefined, max = 1200): string | null {
  if (!input) return null;
  const t = input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const REQUIRED_FOR_PUBLISH = ["name", "startDate", "state", "registrationUrl"] as const;

/** Normalizes a raw candidate. Missing values stay null and are listed in missingFields. */
export function normalizeCandidate(raw: RawCandidate, fallbackSourceUrl: string | null = null): NormalizedCandidate | null {
  const name = cleanText(raw.name, 200);
  if (!name) return null;
  const text = [raw.name, raw.description, raw.organizer, raw.institution].filter(Boolean).join(" ");
  const { sport, confidence } = classifySport(raw.sport, text);
  const price = parsePrice(raw.price);
  let start = parseDate(raw.startDate ?? null);
  let end = parseDate(raw.endDate ?? null);
  if (start && end && end < start) [start, end] = [end, start];

  const c: NormalizedCandidate = {
    name,
    sport,
    sportConfidence: confidence,
    eventType: classifyEventType(raw.eventType, text),
    institution: cleanText(raw.institution, 160),
    organizer: cleanText(raw.organizer, 160),
    city: cleanText(raw.city, 80),
    state: normalizeState(raw.state ?? null),
    venue: cleanText(raw.venue, 160),
    startDate: start,
    endDate: end,
    priceCents: price.cents,
    priceNotes: price.notes,
    registrationUrl: safeHttpUrl(raw.registrationUrl),
    description: cleanText(raw.description, 1200),
    eligibility: cleanText(raw.eligibility, 200),
    participatingColleges: (raw.participatingColleges ?? []).map((s) => cleanText(s, 160)).filter((s): s is string => !!s).slice(0, 100),
    coaches: (raw.coaches ?? []).filter((c) => c?.name).slice(0, 50).map((co) => ({ name: cleanText(co.name, 120)!, title: cleanText(co.title ?? null, 120) })),
    sourceUrl: safeHttpUrl(raw.sourceUrl) ?? safeHttpUrl(fallbackSourceUrl),
    missingFields: [],
  };
  c.missingFields = REQUIRED_FOR_PUBLISH.filter((k) => c[k] == null);
  if (c.priceCents == null) c.missingFields.push("price");
  return c;
}
