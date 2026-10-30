# Camp Check

**Find Camps Worth Your Money.** Camp Check, from The Athlete Market, is an independent directory of college recruiting camps and showcases. It combines community reviews, external sources shown with attribution, and labeled research summaries.

- **Free to discover:** anyone can search, filter by sport, read profiles and reviews, and start a review. No account is needed.
- **Easy to trust:** community reviews, external sources and AI-assisted research are always shown in separate, labeled sections. Ratings are never invented, and unreviewed camps never look highly rated.
- **Worth upgrading:** Recruiting Insider ($19.99/mo) and Insider Elite ($99/mo) add research, comparison, saved lists and personalized matching. Both are included for The Athlete Market members after they link their accounts.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS · PostgreSQL on Railway (postgres.js) · Auth.js (email + password, Google) · Railway Storage Bucket · Stripe · optional Claude API for research drafts.

## Quick start

```bash
npm install
cp .env.example .env.local   # leave DATABASE_URL blank to explore with labeled sample data
npm run dev                   # http://localhost:3000
```

Without a database, the site runs in **preview mode**. It shows clearly labeled, fictional sample listings and no reviews (Camp Check never fabricates reviews). To use real data, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
npm test          # 112 unit tests (vitest)
npm run typecheck
npm run lint
npm run build
```

## Data import

All import scripts take `--dry-run` (runs in a transaction and rolls back) and need `DATABASE_URL`.
Run migrations first, then camps, then reviews and editorial (both match against imported camps).

```bash
node scripts/migrate.mjs
node scripts/import-camps.mjs [--dry-run] data/baseball.json data/softball.json ...
node scripts/import-reviews.mjs [--dry-run] [--verbose] data/reviews.json
node scripts/import-editorial.mjs [--dry-run] [--verbose] data/editorial.json
```

The Camp Check Editor Rating (`camps.editorial_score`, `editorial_pick`, `editorial_rationale`) is our team's own rating. It
drives the default directory order and the homepage Editor's Picks, and it is never blended into parent review averages or counts.
Imported reviews are Camp Check's own paraphrases (attribution "Paraphrased from <platform>"), stored as `permitted` with the
excerpt shown; a platform rating is shown only when it is a public aggregate.

## Organizer logos

Camp cards (Editor's Picks, directory, search, match) show the host's logo left of the title; the camp page shows it larger.
No database columns are involved. Resolution order (`src/lib/logos.ts`):

1. **Local logo**: `src/lib/logos.data.json` maps a name + aliases to a file in `public/logos/`. Matched on the camp's
   institution name first, then its organizer name (case/punctuation-insensitive; also tries the name without `(...)`,
   the text inside `(...)`, and each side of `" - "` / `" / "`).
2. **Automatic fallback** for organizers not mapped yet (new ingests, parent submissions): the site icon of the organizer's own
   domain, taken from the camp's `registration_url`, else `source_url` (Google s2 favicon service, 128px). Generic
   registration/ticketing/form hosts (Ryzer, TotalCamps, Eventbrite, Google Forms, Exposure Events, LeagueApps, ...) are skipped.
3. **Initials badge** (e.g. `PG`) when there is no usable domain or the icon fails to load / is tiny.

Adding a logo for a new organizer (after each ingest):

```bash
# 1. List organizers/schools in the new import files that have no logo yet
node scripts/add-logo.mjs --check data/new-camps.json
# 2. For each one, find its OWN logo (site header logo, og:image or apple-touch-icon; for colleges the official athletics
#    mark, e.g. https://a.espncdn.com/i/teamlogos/ncaa/500/<id>.png after checking the id is that school) and add it:
node scripts/add-logo.mjs "Premier Girls Fastpitch" https://example.com/pgf-logo.png --alias "PGF"
#    --alias "<name>"   any other spelling the data uses (repeatable)
#    --bg "#111827"     dark tile for white/transparent marks
#    --force            add even if the name already resolves to another entry; --dry-run to preview
# 3. Verify and ship
npm test && git add public/logos src/lib/logos.data.json && git commit -m "Add logo: <organizer>"
```

If unsure a logo belongs to that organization, skip it: the fallback icon/initials is better than a wrong logo.

## Docs

| Doc | What's in it |
|---|---|
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phases 1–6: what was built and what remains |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code map, data model, trust rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway Postgres, auth, storage, Stripe, Vercel, cron and admin setup, plus **missing dependencies** |
| [docs/DATA_SOURCES_AND_RIGHTS.md](docs/DATA_SOURCES_AND_RIGHTS.md) | Ingestion policy, content rights, CSV formats |
| [docs/ATHLETE_MARKET_INTEGRATION.md](docs/ATHLETE_MARKET_INTEGRATION.md) | Cross-product entitlement API contract |
