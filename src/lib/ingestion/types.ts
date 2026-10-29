import type { EventType, SportId } from "../sports";

/** A raw event as an adapter found it. Every field optional — never fill gaps with guesses. */
export interface RawCandidate {
  name?: string | null;
  sport?: string | null;
  eventType?: string | null;
  institution?: string | null;
  organizer?: string | null;
  city?: string | null;
  state?: string | null;
  venue?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  price?: string | number | null;
  registrationUrl?: string | null;
  description?: string | null;
  eligibility?: string | null;
  participatingColleges?: string[] | null;
  coaches?: { name: string; title?: string | null }[] | null;
  sourceUrl?: string | null;
}

/** Normalized candidate stored in discovery_queue.candidate. */
export interface NormalizedCandidate {
  name: string;
  sport: SportId;
  sportConfidence: number; // 0..1
  eventType: EventType;
  institution: string | null;
  organizer: string | null;
  city: string | null;
  state: string | null;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  priceCents: number | null;
  priceNotes: string | null;
  registrationUrl: string | null;
  description: string | null;
  eligibility: string | null;
  /** Unverified until an admin confirms them against an official source. */
  participatingColleges: string[];
  coaches: { name: string; title: string | null }[];
  sourceUrl: string | null;
  missingFields: string[];
}

export interface SourceRecord {
  id: string;
  name: string;
  kind: string;
  adapter: "schema_org" | "ical" | "json_feed" | "csv" | "manual";
  baseUrl: string | null;
  config: Record<string, unknown>;
  contentRights: "facts_only" | "licensed_display" | "licensed_excerpt" | "link_only" | "prohibited" | "unknown";
  respectsRobots: boolean;
  rateLimitPerMinute: number;
  enabled: boolean;
  termsReviewedAt: string | null;
}

export interface FetchLike {
  getText(url: string): Promise<{ ok: true; text: string; url: string } | { ok: false; reason: string; blocked: boolean }>;
}

export interface AdapterContext {
  fetcher: FetchLike;
  log: (msg: string) => void;
  /** Inline content for CSV uploads. */
  inlineContent?: string;
}

export interface SourceAdapter {
  discover(source: SourceRecord, ctx: AdapterContext): Promise<RawCandidate[]>;
}
