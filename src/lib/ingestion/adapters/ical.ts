import type { RawCandidate, SourceAdapter } from "../types";

/** Parses VEVENTs from an iCalendar feed (RFC 5545), including folded lines. */
export function parseIcs(ics: string, feedUrl: string): RawCandidate[] {
  const lines = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: RawCandidate[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) out.push(toCandidate(cur, feedUrl));
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    cur[key] = unescape(line.slice(idx + 1));
  }
  return out;
}

function unescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");
}

function toCandidate(e: Record<string, string>, feedUrl: string): RawCandidate {
  // iCal DTEND for all-day events is exclusive; shift back one day.
  let end = e.DTEND ?? null;
  if (end && /^\d{8}$/.test(end)) {
    const d = new Date(Date.UTC(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8) - 1));
    end = d.toISOString().slice(0, 10);
  }
  const loc = e.LOCATION ?? "";
  const cityState = /([A-Za-z .'-]+),\s*([A-Z]{2})\b/.exec(loc);
  return {
    name: e.SUMMARY ?? null,
    description: e.DESCRIPTION ?? null,
    startDate: e.DTSTART ?? null,
    endDate: end,
    venue: loc ? loc.split(",")[0] : null,
    city: cityState ? cityState[1].trim().split(/\s{2,}/).pop() ?? null : null,
    state: cityState ? cityState[2] : null,
    registrationUrl: e.URL ?? null,
    sourceUrl: e.URL ?? feedUrl,
  };
}

export const icalAdapter: SourceAdapter = {
  async discover(source, ctx) {
    const url = (source.config.url as string | undefined) ?? source.baseUrl;
    if (!url) throw new Error("iCal source needs a feed URL");
    const res = await ctx.fetcher.getText(url);
    if (!res.ok) throw new Error(res.reason);
    const defaults = (source.config.defaults ?? {}) as Partial<RawCandidate>;
    return parseIcs(res.text, url).map((c) => ({ ...defaults, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)) }));
  },
};
