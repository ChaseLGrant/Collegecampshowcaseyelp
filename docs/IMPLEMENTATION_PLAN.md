# Implementation plan & status

## Starting point
The `Collegecampshowcaseyelp` repository was **empty** (no commits or branches) when this work began, and no other repository in the account contained the Camp Check app. Nothing could be preserved, so Camp Check was built from scratch on the architecture the brief specified: Next.js + TypeScript + Tailwind + Supabase (auth, RLS, moderation) with a mobile-first UI. If an earlier Camp Check codebase exists somewhere else (for example, an unpushed local copy or a different builder tool), it can be merged into this structure. The data layer (`src/lib/data/repository.ts`) and schema are the integration points.

## Phase 1 — Low-friction search, sport directories, event pages ✅
- Homepage with the headline, subheadline, search bar and the 8 sport chips directly below. No popups and no required onboarding.
- The chosen sport is remembered in the `cg_sport` cookie and the URL, and stays active across search, the homepage and directories until changed.
- `/search` plus `/baseball-camps`, `/softball-camps`, `/football-camps`, `/basketball-camps`, `/soccer-camps`, `/volleyball-camps`, `/lacrosse-camps`, and state sub-pages (`/baseball-camps/texas`).
- Filters: sport, state, college, association and division (verified only), event type, price, dates, minimum community rating, and minimum review count. Filters are shareable URLs and work without JavaScript.
- Camp pages keep three separated sections: **Camp Check Community Reviews**, **External Review Sources** and **Camp Check Research Summary**.
- Review form: mobile-first, five original categories, can be started without an account, draft saved in the browser and restored after sign-in, 18+ confirmation, honeypot, timing and duplicate checks, optional attendance proof.

## Phase 2 — Discovery, authorized imports, attribution ✅ (code) / ⚠️ (no live sources configured)
- Source registry with content rights, terms review, rate limits and refresh intervals.
- Adapters: schema.org JSON-LD event pages, iCal feeds, JSON feeds and licensed APIs (credentials via env var), and CSV.
- A polite fetcher that follows robots.txt and crawl-delay, rate-limits per host, identifies itself honestly, and stops on 401/403/429, logins and bot challenges. It never bypasses them.
- Normalization (sport and event-type classification with confidence; price, date and state parsing). Missing facts stay blank and are listed for the admin.
- Duplicate detection (fingerprint plus similarity score). Everything goes to the **discovery queue**, and nothing is published without admin approval.
- Field-level provenance (`camp_field_provenance`), source URLs and last-verified dates. Stale listings are flagged automatically.
- Scheduled refresh (`/api/cron/refresh`) with backoff, plus failed-import alerts on the admin overview.

## Phase 3 — External review research ✅ (code) / ⚠️ (no licensed datasets yet)
- `external_reviews` table with platform, URL, provenance type, rights status, per-field permissions, attribution and match confidence.
- The database view `external_reviews_public` hides any field without display rights. The same rules are in code (`toPublicExternalReview`) and tested.
- CSV import for licensed datasets, automatic camp matching with confidence, and an admin approval and rights review screen.
- Research summaries are built from numbered facts (verified fact, advertised claim, community opinion, external source). Claude drafts them and must cite facts; uncited sentences and outcome guarantees are removed automatically. An admin approves each one before publication. A template is used when AI isn't configured.

## Phase 4 — Subscriptions, Stripe, The Athlete Market ✅ (code) / ⚠️ (needs keys)
- Plans live in the database and are editable at `/admin/plans`. Prices are configurable, not hardcoded.
- Stripe Checkout, Customer Portal and a signature-verified, idempotent webhook that re-fetches subscriptions.
- One entitlement model that merges Stripe, Athlete Market and admin grants. Includes a grace period for failed payments and expiry on cancel.
- The Athlete Market link uses OAuth 2.0 with PKCE (sign-in proves ownership, never email matching). Includes a signed webhook and a signed `/api/v1/entitlements` API.

## Phase 5 — Matching & comparison ✅
- `/compare`: free users compare 2 camps; Insider members compare 4 and also see external research and summaries. Every cell is labeled verified, advertised, opinion, research, estimate or missing. A factual tradeoff summary is included.
- `/match` (Elite): the optional profile filters on sport, budget, travel and grad year, scores fit, and explains the reasons and cautions. It never promises outcomes.

## Phase 6 — Security, data quality, SEO, deployment ✅
- RLS on every table. Moderation-only columns are hidden from the public API. A database trigger makes review content editable only by its author, so imports and admins cannot rewrite or fabricate reviews.
- Same-origin checks on browser POSTs, rate limits, safe-URL rendering, open-redirect protection, file-type checks on uploads, security headers and an audit log.
- SEO: per-sport and per-state metadata, canonical URLs, breadcrumbs, SportsEvent JSON-LD (aggregateRating only from 3+ native reviews), sitemap of real pages only, and thin state pages set to noindex.
- 92 unit tests covering ratings, search, review anti-spam, robots and fetcher behavior, normalization, dedupe, adapters, ingestion policy, rights, matching, comparison, entitlements, Stripe mapping, Athlete Market mapping, HMAC signing, research validation, JSON-LD and URL safety.

## Next steps (recommended)
1. Create the Supabase project and Stripe products (see DEPLOYMENT.md), then make yourself admin.
2. Add the first real sources. Start with official college camp pages that publish schema.org events or iCal feeds, and review each site's terms first.
3. Seed reviews **organically**: email past camp attendees from The Athlete Market community and ask for honest reviews. Never write reviews yourself.
4. Have The Athlete Market team implement the 3 endpoints in ATHLETE_MARKET_INTEGRATION.md.
5. Later: email notifications for Elite (the `notifications` feature flag exists; no email provider is wired up yet), a shared rate limiter (Upstash) for multi-region deploys, and end-to-end tests against a Supabase test project.
