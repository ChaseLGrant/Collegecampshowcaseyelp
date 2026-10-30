// Sets CampGrade editorial ratings on existing camps. Never touches parent reviews.
// Usage: DATABASE_URL=... node scripts/import-editorial.mjs [--dry-run] [--verbose] editorial.json
//   --dry-run  run inside a transaction and roll it back (reports matches / unmatched rows)
//
// editorial.json is a JSON array. Each object (aliases in brackets):
// {
//   "sport": "baseball",                         required
//   "name": "exact camp name",                   [camp_name]  required
//   "start_date": "2027-01-16" | null,           required key; null matches camps with no start date
//   "editorial_score": 4.6,                      [score]      1.0-5.0 (rounded to one decimal) or null to clear
//   "editorial_pick": true,                      [editors_pick, pick]  default false
//   "editorial_rationale": "Why we rate it..."   [rationale]  optional
// }
// Match: same sport + normalized name (case/punctuation-insensitive) + same start_date.
// A row that matches no camp, or more than one, is reported and skipped.
import { connect, dateStr, inTransaction, isoDate, nameKey, normalizeScore, parseArgs, pick, readJsonArray, truthy } from "./lib/import-utils.mjs";

const { dryRun, verbose, files } = parseArgs();
if (files.length !== 1) { console.error("Usage: node scripts/import-editorial.mjs [--dry-run] [--verbose] editorial.json"); process.exit(1); }

const sql = connect();
const stats = { rows: 0, updated: 0, invalid: 0, unmatched: 0, ambiguous: 0, picks: 0 };
const problems = [];

try {
  const input = readJsonArray(files[0]);
  await inTransaction(sql, dryRun, async (tx) => {
    const camps = await tx`select id, name, sport, start_date from camps`;
    const index = new Map();
    for (const c of camps) {
      const k = `${c.sport}|${nameKey(c.name)}|${dateStr(c.start_date) ?? ""}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(c);
    }
    for (const [i, r] of input.entries()) {
      stats.rows++;
      const where = `row ${i}`;
      const sport = pick(r, "sport");
      const name = pick(r, "name", "camp_name");
      const rawStart = pick(r, "start_date");
      const start = isoDate(rawStart);
      if (!sport || !name || (rawStart !== undefined && !start)) {
        stats.invalid++; problems.push(`${where}: needs sport, name and start_date (YYYY-MM-DD or null)`); continue;
      }
      const rawScore = pick(r, "editorial_score", "score");
      const score = normalizeScore(rawScore);
      if (rawScore !== undefined && score === null) { stats.invalid++; problems.push(`${where}: editorial_score must be 1-5`); continue; }
      const isPick = truthy(pick(r, "editorial_pick", "editors_pick", "pick"));
      const rationaleRaw = pick(r, "editorial_rationale", "rationale");
      const rationale = typeof rationaleRaw === "string" && rationaleRaw.trim() ? rationaleRaw.trim().slice(0, 2000) : null;

      const hits = index.get(`${sport}|${nameKey(name)}|${start ?? ""}`) ?? [];
      if (!hits.length) { stats.unmatched++; problems.push(`${where}: no camp "${name}" (${sport}, ${start ?? "no date"})`); continue; }
      if (hits.length > 1) { stats.ambiguous++; problems.push(`${where}: ${hits.length} camps match "${name}" (${sport}, ${start ?? "no date"})`); continue; }

      await tx`update camps set editorial_score = ${score}, editorial_pick = ${isPick}, editorial_rationale = ${rationale}
               where id = ${hits[0].id}`;
      stats.updated++;
      if (isPick) stats.picks++;
      if (verbose) console.log(`${where}: ${hits[0].id} score=${score} pick=${isPick}`);
    }
  });
  console.log(JSON.stringify({ dryRun, ...stats }));
  if (problems.length) console.log(problems.join("\n"));
} finally {
  await sql.end();
}
