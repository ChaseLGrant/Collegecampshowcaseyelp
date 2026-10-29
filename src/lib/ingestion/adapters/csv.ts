import { parseCsv } from "../csv";
import type { RawCandidate, SourceAdapter } from "../types";

/** Accepted CSV columns for camp imports (see docs/DATA_SOURCES_AND_RIGHTS.md). */
export const CAMP_CSV_COLUMNS = [
  "name", "sport", "event_type", "institution", "organizer", "city", "state", "venue",
  "start_date", "end_date", "price", "registration_url", "description", "eligibility",
  "participating_colleges", "source_url",
] as const;

export function csvRowsToCandidates(text: string): { candidates: RawCandidate[]; errors: string[] } {
  const { headers, rows } = parseCsv(text);
  const errors: string[] = [];
  if (!headers.includes("name")) errors.push('Missing required "name" column');
  if (!headers.includes("source_url")) errors.push('Missing "source_url" column — every row needs its source for attribution');
  if (rows.length > 5000) errors.push("CSV is limited to 5,000 rows per import");
  if (errors.length) return { candidates: [], errors };
  const candidates = rows.map((r, i) => {
    if (!r.source_url) errors.push(`Row ${i + 2}: missing source_url`);
    return {
      name: r.name, sport: r.sport, eventType: r.event_type, institution: r.institution, organizer: r.organizer,
      city: r.city, state: r.state, venue: r.venue, startDate: r.start_date, endDate: r.end_date, price: r.price,
      registrationUrl: r.registration_url, description: r.description, eligibility: r.eligibility,
      participatingColleges: r.participating_colleges ? r.participating_colleges.split(/;|\|/).map((s) => s.trim()) : [],
      sourceUrl: r.source_url,
    } satisfies RawCandidate;
  });
  return { candidates, errors };
}

export const csvAdapter: SourceAdapter = {
  async discover(source, ctx) {
    let text = ctx.inlineContent;
    if (!text) {
      const url = (source.config.url as string | undefined) ?? source.baseUrl;
      if (!url) throw new Error("CSV source needs config.url or an uploaded file");
      const res = await ctx.fetcher.getText(url);
      if (!res.ok) throw new Error(res.reason);
      text = res.text;
    }
    const { candidates, errors } = csvRowsToCandidates(text);
    errors.slice(0, 20).forEach((e) => ctx.log(e));
    return candidates.filter((c) => c.sourceUrl);
  },
};
