// Imports researched camps JSON files (one JSON array per file; format in /workspace/work/campgrade-data/BRIEF.md).
// Usage: DATABASE_URL=... node scripts/import-camps.mjs [--dry-run] file1.json [file2.json ...]
//   --dry-run  run everything inside a transaction and roll it back (prints what would be inserted)
// Optional per-camp editorial fields are also accepted: editorial_score (1-5), editorial_pick, editorial_rationale.
// Camps whose start_date is before today are skipped; existing slugs are left untouched (on conflict do nothing).
import { connect, inTransaction, normalizeScore, parseArgs, readJsonArray, slugify, truthy } from "./lib/import-utils.mjs";

const { dryRun, files } = parseArgs();
if (!files.length) { console.error("Usage: node scripts/import-camps.mjs [--dry-run] file.json ..."); process.exit(1); }
const sql = connect();
const today = new Date().toISOString().slice(0, 10);
const SPORTS = ["baseball","softball","football","basketball","soccer","volleyball","lacrosse","other"];
const TYPES = ["prospect_camp","id_camp","showcase","clinic","combine","elite_camp","tournament","other"];
const ASSOC = ["NCAA","NAIA","NJCAA","CCCAA","USCAA","NWAC","Other"];
const DIV = ["D1","D2","D3"];
const KINDS = ["college","showcase_company","club","other"];
const st = (s) => (s && /^[A-Za-z]{2}$/.test(s.trim()) ? s.trim().toUpperCase() : null);
const date = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

let inserted = 0, skipped = 0;
const skippedWhy = {};
const skip = (why) => { skipped++; skippedWhy[why] = (skippedWhy[why] ?? 0) + 1; };
try {
  await inTransaction(sql, dryRun, async (sql) => {
  for (const file of files) {
    const rows = readJsonArray(file);
    for (const c of rows) {
      if (!c?.name || !SPORTS.includes(c.sport)) { skip("invalid name/sport"); continue; }
      const start = date(c.start_date), end = date(c.end_date);
      if (start && start < today) { skip("past start_date"); continue; }
      let orgId = null;
      if (c.organizer?.name) {
        const oslug = slugify(c.organizer.name);
        const [o] = await sql`insert into organizers (name, slug, kind, website)
          values (${c.organizer.name}, ${oslug}, ${KINDS.includes(c.organizer.kind) ? c.organizer.kind : "other"}, ${c.organizer.website ?? null})
          on conflict (slug) do update set website = coalesce(organizers.website, excluded.website) returning id`;
        orgId = o.id;
      }
      let instId = null;
      if (c.institution?.name) {
        const i = c.institution; const islug = slugify(i.name);
        const [r] = await sql`insert into institutions (name, slug, city, state, association, division)
          values (${i.name}, ${islug}, ${i.city ?? null}, ${st(i.state)}, ${ASSOC.includes(i.association) ? i.association : null}, ${DIV.includes(i.division) ? i.division : null})
          on conflict (slug) do update set city = coalesce(institutions.city, excluded.city) returning id`;
        instId = r.id;
      }
      const base = slugify(`${c.name} ${c.city ?? ""} ${start ? start.slice(0, 7) : ""}`);
      const edScore = normalizeScore(c.editorial_score);
      const edPick = truthy(c.editorial_pick);
      const edWhy = typeof c.editorial_rationale === "string" && c.editorial_rationale.trim() ? c.editorial_rationale.trim() : null;
      const search = [c.name, c.sport, c.sport_detail, c.organizer?.name, c.institution?.name, c.venue, c.city, c.state, c.description].filter(Boolean).join(" ");
      const res = await sql`insert into camps (slug, name, sport, sport_detail, event_type, institution_id, organizer_id, venue, city, state,
          start_date, end_date, price_cents, price_notes, registration_url, description, eligibility, positions, status,
          verification_status, last_verified_at, source_url, search_text, editorial_score, editorial_pick, editorial_rationale)
        values (${base}, ${c.name}, ${c.sport}, ${c.sport_detail ?? null}, ${TYPES.includes(c.event_type) ? c.event_type : "other"}, ${instId}, ${orgId},
          ${c.venue ?? null}, ${c.city ?? null}, ${st(c.state)}, ${start}, ${end && (!start || end >= start) ? end : start},
          ${Number.isInteger(c.price_cents) && c.price_cents >= 0 ? c.price_cents : null}, ${c.price_notes ?? null}, ${c.registration_url ?? null},
          ${c.description ?? null}, ${c.eligibility ?? null}, ${Array.isArray(c.positions) ? c.positions : []}, 'published',
          'verified', now(), ${c.source_url ?? null}, ${search}, ${edScore}, ${edPick}, ${edWhy})
        on conflict (slug) do nothing returning id`;
      if (res.length) inserted++; else skip("slug already exists");
    }
  }
  });
  console.log(JSON.stringify({ dryRun, inserted, skipped, skippedWhy }));
} finally { await sql.end(); }
