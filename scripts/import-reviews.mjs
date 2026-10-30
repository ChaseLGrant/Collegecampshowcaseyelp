// Imports CampGrade's paraphrased summaries of public feedback into external_reviews.
// Usage: DATABASE_URL=... node scripts/import-reviews.mjs [--dry-run] [--verbose] reviews.json
//   --dry-run  run inside a transaction and roll it back (reports matches / unmatched rows)
//
// reviews.json is a JSON array. Each object (aliases in brackets):
// {
//   "match": { "camp_name": "...", "organizer_name": "..." },   (or camp_name / organizer_name at top level)
//   "camp_name": "exact camp name as imported"            [match.camp_name, camp, name] - optional if organizer given
//   "sport": "baseball",                                   optional, narrows the camp match
//   "start_date": "2027-01-16",                            optional, narrows the camp match
//   "organizer_name": "Perfect Game",                      [match.organizer_name, organizer.name] - fallback match
//   "referenced_name": "name as the source wrote it",      optional (defaults to the matched name)
//   "provenance_type": "public_page",                      public_page | organizer_testimonial | editorial | ...
//   "match_confidence": 0.8,                               optional 0-1; rows below 0.6 are imported but not shown
//   "platform": "Google Reviews",                          [platform_name]          - required
//   "source_url": "https://...",                           [url]                    - required (http/https)
//   "review_date": "2026-06-01",                           [date]                   - optional
//   "summary": "Our own 1-3 sentence paraphrase.",         [excerpt, paraphrase]    - required, <= 600 chars
//   "sentiment": "positive|mixed|negative|neutral",        optional
//   "rating": 4.6, "rating_scale": 5,                      optional
//   "rating_is_public_aggregate": true                     [rating_public_aggregate, rating_is_aggregate,
//                                                           rating_type: "aggregate"] - only then is the rating shown.
//                                                           If the flag is absent, a rating counts as a public aggregate
//                                                           only when the summary cites a review count ("from 9 reviews").
// }
// Matching: camp by (normalized name [+ sport] [+ start_date]); if no camp matches, organizer by normalized
// name (organizer_name, then camp_name). Organizer-level rows show on every camp by that organizer.
// Rows are inserted as status 'approved', rights_status 'permitted', excerpt = summary, excerpt_permitted true,
// rating_display_permitted only for public aggregates, attribution "Paraphrased from <platform>".
// Re-running is safe: a row with the same source_url for the same camp/organizer is skipped.
import { connect, dateStr, inTransaction, isoDate, nameKey, parseArgs, pick, readJsonArray, truthy } from "./lib/import-utils.mjs";

const { dryRun, verbose, files } = parseArgs();
if (files.length !== 1) { console.error("Usage: node scripts/import-reviews.mjs [--dry-run] [--verbose] reviews.json"); process.exit(1); }
const SENTIMENTS = ["positive", "mixed", "negative", "neutral"];
const MAX_EXCERPT = 600;
const MAX_CAMP_FANOUT = 12;
const MIN_DISPLAY_CONFIDENCE = 0.6; // same threshold as src/lib/external-reviews/rights.ts
const PROVENANCE = ["licensed_dataset", "authorized_api", "public_page", "organizer_testimonial", "editorial"]; // a name matching more camps than this is treated as ambiguous

const httpUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch { return null; } };

const sql = connect();
const stats = { rows: 0, inserted: 0, duplicates: 0, invalid: 0, unmatched: 0, ambiguous: 0, low_confidence: 0, camp_rows: 0, organizer_rows: 0, ratings_shown: 0 };
const problems = [];

try {
  const input = readJsonArray(files[0]);
  await inTransaction(sql, dryRun, async (tx) => {
    const camps = await tx`select id, name, sport, start_date, organizer_id from camps`;
    const organizers = await tx`select id, name, slug from organizers`;
    const campsByKey = new Map();
    for (const c of camps) {
      const k = nameKey(c.name);
      if (!campsByKey.has(k)) campsByKey.set(k, []);
      campsByKey.get(k).push(c);
    }
    const orgByKey = new Map();
    for (const o of organizers) { orgByKey.set(nameKey(o.name), o); orgByKey.set(nameKey(o.slug), o); }

    for (const [i, r] of input.entries()) {
      stats.rows++;
      const where = `row ${i}`;
      const platform = String(pick(r, "platform", "platform_name") ?? "").trim();
      const url = httpUrl(pick(r, "source_url", "url"));
      let summary = String(pick(r, "summary", "excerpt", "paraphrase") ?? "").trim().replace(/\s+/g, " ");
      if (!platform || !url || !summary) { stats.invalid++; problems.push(`${where}: needs platform, http(s) source_url and summary`); continue; }
      if (summary.length > MAX_EXCERPT) {
        summary = summary.slice(0, MAX_EXCERPT - 1).replace(/\s+\S*$/, "") + "…";
        problems.push(`${where}: summary truncated to ${MAX_EXCERPT} chars`);
      }
      const campName = pick(r, "match.camp_name", "camp_name", "camp", "name");
      const orgName = pick(r, "match.organizer_name", "organizer_name", "organizer.name", "organizer");
      const orgNameStr = typeof orgName === "string" ? orgName : undefined;
      const sport = pick(r, "sport");
      const start = isoDate(pick(r, "start_date"));

      // 1) camp match
      let targets = [];
      let confidence = 0;
      let method = "";
      if (campName) {
        let hits = campsByKey.get(nameKey(campName)) ?? [];
        if (sport) hits = hits.filter((c) => c.sport === sport);
        if (start) hits = hits.filter((c) => dateStr(c.start_date) === start);
        if (hits.length > MAX_CAMP_FANOUT) { stats.ambiguous++; problems.push(`${where}: "${campName}" matches ${hits.length} camps; add sport/start_date`); continue; }
        if (hits.length) {
          targets = hits.map((c) => ({ camp_id: c.id, organizer_id: null, sport: c.sport, referenced: campName }));
          confidence = start ? 1 : hits.length === 1 ? 0.95 : 0.85;
          method = `camp_name${sport ? "+sport" : ""}${start ? "+start_date" : ""}`;
        }
      }
      // 2) organizer match
      if (!targets.length) {
        const o = (orgNameStr && orgByKey.get(nameKey(orgNameStr))) || (campName && orgByKey.get(nameKey(campName)));
        if (o) {
          targets = [{ camp_id: null, organizer_id: o.id, sport: sport ?? null, referenced: orgNameStr ?? campName }];
          confidence = 0.9;
          method = orgNameStr && orgByKey.get(nameKey(orgNameStr)) ? "organizer_name" : "camp_name=organizer";
        }
      }
      if (!targets.length) { stats.unmatched++; problems.push(`${where}: no camp/organizer match for camp "${campName ?? "-"}" / organizer "${orgNameStr ?? "-"}"`); continue; }
      const givenConf = Number(pick(r, "match_confidence"));
      if (Number.isFinite(givenConf) && givenConf >= 0 && givenConf <= 1) confidence = Math.round(givenConf * 100) / 100;
      if (confidence < MIN_DISPLAY_CONFIDENCE) { stats.low_confidence++; problems.push(`${where}: match_confidence ${confidence} < ${MIN_DISPLAY_CONFIDENCE}; imported but hidden from camp pages`); }
      const provenance = PROVENANCE.includes(pick(r, "provenance_type")) ? pick(r, "provenance_type") : "public_page";
      const referencedName = String(pick(r, "referenced_name") ?? "").trim();

      const rating = Number(pick(r, "rating"));
      const scale = Number(pick(r, "rating_scale", "scale") ?? 5);
      const hasRating = Number.isFinite(rating) && Number.isFinite(scale) && scale > 0 && rating >= 0 && rating <= scale && scale < 100;
      const flag = pick(r, "rating_is_public_aggregate", "rating_public_aggregate", "rating_is_aggregate");
      const aggregate = flag !== undefined ? truthy(flag)
        : String(pick(r, "rating_type") ?? "").toLowerCase() === "aggregate" || /\b\d[\d,]*\s+(reviews|ratings)\b/i.test(summary);
      const showRating = hasRating && aggregate;
      const sentimentRaw = String(pick(r, "sentiment") ?? "").toLowerCase().trim();
      const sentiment = SENTIMENTS.includes(sentimentRaw) ? sentimentRaw : null;
      const reviewDate = isoDate(pick(r, "review_date", "date"));

      for (const t of targets) {
        const [dup] = await tx`
          select id from external_reviews
          where source_url = ${url}
            and camp_id is not distinct from ${t.camp_id}::uuid
            and organizer_id is not distinct from ${t.organizer_id}::uuid
          limit 1`;
        if (dup) { stats.duplicates++; continue; }
        await tx`
          insert into external_reviews (
            platform_name, source_url, provenance_type, camp_id, organizer_id, referenced_name, sport, review_date,
            rating, rating_scale, rating_display_permitted, excerpt, excerpt_permitted, reviewer_display,
            reviewer_display_permitted, attribution, rights_status, match_confidence, match_method, status,
            reviewed_at, sentiment)
          values (
            ${platform}, ${url}, ${provenance}, ${t.camp_id}, ${t.organizer_id}, ${(referencedName || String(t.referenced)).slice(0, 300)}, ${t.sport},
            ${reviewDate}, ${hasRating ? rating : null}, ${hasRating ? scale : null}, ${showRating}, ${summary}, true, null,
            false, ${`Paraphrased from ${platform}`}, 'permitted', ${confidence}, ${method}, 'approved',
            now(), ${sentiment})`;
        stats.inserted++;
        if (t.camp_id) stats.camp_rows++; else stats.organizer_rows++;
        if (showRating) stats.ratings_shown++;
        if (verbose) console.log(`${where}: ${method} -> ${t.camp_id ? "camp " + t.camp_id : "organizer " + t.organizer_id}`);
      }
    }
  });
  console.log(JSON.stringify({ dryRun, ...stats }));
  if (problems.length) console.log(problems.join("\n"));
} finally {
  await sql.end();
}
