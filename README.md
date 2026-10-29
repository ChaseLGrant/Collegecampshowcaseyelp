# CampGrade

**Find Camps Worth Your Money.** CampGrade, from The Athlete Market, is an independent directory of college recruiting camps and showcases. It combines community reviews, external sources shown with attribution, and labeled research summaries.

- **Free to discover:** anyone can search, filter by sport, read profiles and reviews, and start a review. No account is needed.
- **Easy to trust:** community reviews, external sources and AI-assisted research are always shown in separate, labeled sections. Ratings are never invented, and unreviewed camps never look highly rated.
- **Worth upgrading:** Recruiting Insider ($19.99/mo) and Insider Elite ($99/mo) add research, comparison, saved lists and personalized matching. Both are included for The Athlete Market members after they link their accounts.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Storage, RLS) · Stripe · optional Claude API for research drafts.

## Quick start

```bash
npm install
cp .env.example .env.local   # leave Supabase blank to explore with labeled sample data
npm run dev                   # http://localhost:3000
```

Without Supabase, the site runs in **preview mode**. It shows clearly labeled, fictional sample listings and no reviews (CampGrade never fabricates reviews). To use real data, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
npm test          # 92 unit tests (vitest)
npm run typecheck
npm run lint
npm run build
```

## Docs

| Doc | What's in it |
|---|---|
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phases 1–6: what was built and what remains |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code map, data model, trust rules |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Supabase, Stripe, Vercel, cron and admin setup, plus **missing dependencies** |
| [docs/DATA_SOURCES_AND_RIGHTS.md](docs/DATA_SOURCES_AND_RIGHTS.md) | Ingestion policy, content rights, CSV formats |
| [docs/ATHLETE_MARKET_INTEGRATION.md](docs/ATHLETE_MARKET_INTEGRATION.md) | Cross-product entitlement API contract |
