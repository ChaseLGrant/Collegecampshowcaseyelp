# Architecture

```
src/
  app/                       Next.js App Router pages and API routes
    page.tsx                 Homepage (search + sport chips)
    search/                  Search results
    [directory]/             /{sport}-camps and /{sport}-camps/{state}
    camps/[slug]/            Camp profile (+ /review form)
    compare/ match/ pricing/ account/ login/ methodology/ submit-camp/
    admin/                   Staff dashboard (queue, sources, imports, moderation, research, plans, entitlements)
    api/                     reviews, billing, Stripe webhook, Athlete Market, cron, v1 entitlements
  components/                UI (server components by default; client ones marked "use client")
  lib/
    db/                      postgres.js pool + asUser() transactions
    auth/                    Auth.js user helpers (bcrypt, Google linking); config in src/auth.ts
    storage/                 Private S3-compatible proof storage (Railway bucket)
    leads.ts                 Lead capture validation + CSV export
    data/                    Repository: Postgres (live) or labeled sample/empty fallback
    ingestion/               robots, polite fetcher, adapters, normalize, dedupe, policy, pipeline
    external-reviews/        rights rules, matching, CSV import
    research/                fact builder, template + Claude drafting, citation validator
    billing/                 plans, entitlements, Stripe helpers, Athlete Market client
    matching/ compare/       Premium logic (pure functions)
    reviews/                 validation + spam scoring
    seo/ security/ server/ actions/ admin/
db/migrations/               Plain-Postgres schema, triggers, views, seed plans, leads
scripts/migrate.mjs          Applies migrations once each
tests/                       Vitest unit tests
```

## Trust rules and where they are enforced
| Rule | Where |
|---|---|
| Unreviewed camps never look highly rated | `ratings.ts` (`ratingDisplay`, `rankingScore`), `camp_directory.ranking_score`, filters skip unreviewed camps for min-rating |
| Imports can't touch community reviews | `reviews_content_guard` trigger (requires `app.user_id` = author, set by `asUser()`) + test that scans ingestion code |
| Only staff reach admin | `requireStaff()` in every admin page/action/route (formerly RLS) + test that checks each one |
| External content is shown only with rights | `external_reviews_public` view + `toPublicExternalReview` |
| External ratings are never merged into native ones | `camp_rating_stats` reads only `reviews` |
| AI research is never a review and must cite facts | `research_summaries` table, `validateAiOutput`, admin approval |
| Nothing auto-publishes from ingestion | `discovery_queue` + `approveQueueItem` |
| Free discovery is never paywalled | Free features are always granted (`resolveAccess`); public pages don't require auth |
| Bundled access requires proven ownership | OAuth + PKCE + state bound to user |

Most logic is in pure functions with no I/O, which makes it unit-testable. Server pages call repositories and server actions, and every admin action re-checks the user's role and writes `audit_log`.
