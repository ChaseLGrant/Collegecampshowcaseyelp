import type { RawCandidate, SourceAdapter } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const EVENT_TYPES = new Set(["Event", "SportsEvent", "EducationEvent", "SocialEvent"]);

/** Extracts schema.org Event objects from JSON-LD blocks — structured data the site publishes for machines. */
export function extractJsonLdEvents(html: string, pageUrl: string): RawCandidate[] {
  const out: RawCandidate[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data: any;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n["@graph"]) walk(n["@graph"]);
      const t = n["@type"];
      if ((Array.isArray(t) ? t : [t]).some((x) => EVENT_TYPES.has(x))) nodes.push(n);
    };
    walk(data);
    for (const ev of nodes) out.push(eventToCandidate(ev, pageUrl));
  }
  return out;
}

function text(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text(v.name ?? v["@value"]);
  return null;
}

function eventToCandidate(ev: any, pageUrl: string): RawCandidate {
  const loc = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  const addr = loc?.address && typeof loc.address === "object" ? loc.address : null;
  const offer = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
  const organizer = Array.isArray(ev.organizer) ? ev.organizer[0] : ev.organizer;
  return {
    name: text(ev.name),
    sport: text(ev.sport),
    description: text(ev.description),
    startDate: text(ev.startDate),
    endDate: text(ev.endDate),
    venue: text(loc?.name),
    city: text(addr?.addressLocality),
    state: text(addr?.addressRegion),
    price: offer?.price != null ? text(offer.price) : null,
    registrationUrl: text(offer?.url) ?? text(ev.url),
    organizer: text(organizer),
    sourceUrl: pageUrl,
  };
}

export const schemaOrgAdapter: SourceAdapter = {
  async discover(source, ctx) {
    const urls = (Array.isArray(source.config.urls) ? (source.config.urls as string[]) : []).slice(0, 50);
    if (!urls.length && source.baseUrl) urls.push(source.baseUrl);
    const defaults = (source.config.defaults ?? {}) as Partial<RawCandidate>;
    const out: RawCandidate[] = [];
    for (const url of urls) {
      const res = await ctx.fetcher.getText(url);
      if (!res.ok) {
        ctx.log(`${url}: ${res.reason}`);
        if (res.blocked) throw new Error(`Blocked: ${res.reason}`);
        continue;
      }
      const events = extractJsonLdEvents(res.text, res.url);
      ctx.log(`${url}: found ${events.length} structured event(s)`);
      out.push(...events.map((e) => ({ ...defaults, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null)) })));
    }
    return out;
  },
};
