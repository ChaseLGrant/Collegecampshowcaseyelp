# Deployment

## 1. Database (Railway PostgreSQL)
1. In Railway, create a project with a **Postgres** service and enable its **public TCP proxy** (Settings → Networking). The app connects from Vercel through that proxy URL (`postgresql://postgres:<password>@<host>.proxy.rlwy.net:<port>/railway`), always over TLS.
2. Apply the migrations in `db/migrations/` (tracked in `schema_migrations`, safe to re-run):
   ```bash
   DATABASE_URL='<railway public url>' npm run db:migrate
   ```
3. Authorization lives in server code, not the database: every admin page, admin action and admin route calls `requireStaff()`, and every user-scoped read or write is filtered by the signed-in user's id. The database still guards one invariant itself — community review **content** can only be inserted or edited inside a transaction whose `app.user_id` is the review's author (`reviews_content_guard`), so ingestion, imports and admin tools can never fabricate or rewrite reviews.
4. Create an account on the site (email + password), then make yourself admin with SQL:
   ```sql
   update profiles set role = 'admin' where id = (select id from users where lower(email) = lower('you@example.com'));
   ```
   Use `role = 'moderator'` for people who should only moderate reviews. Roles can only be changed with SQL.

### Auth (Auth.js / NextAuth v5)
- Email + password works out of the box (bcrypt, cost 12). No email provider is needed.
- Google sign-in turns on automatically when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set. In Google Cloud Console create an OAuth client (Web), add `https://<domain>/api/auth/callback/google` (and each preview domain you test on) as an authorized redirect URI. A Google account links to an existing email account only when Google reports the email as verified.

### Attendance-proof storage (Railway Storage Bucket)
Create a bucket in the same Railway project and copy its S3 credentials into `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Objects are private: reviewers upload through `/api/reviews/proof`, moderators open 10-minute presigned links, and the file is deleted once attendance is verified or rejected.

## 2. Stripe
1. Create two **recurring** Prices: Recruiting Insider ($19.99/mo) and Insider Elite ($99/mo).
2. In `/admin/plans`, paste each `price_...` ID into the matching plan. Until a price ID is set, the paid plans link to The Athlete Market (`INSIDER_CTA_URL`) with a "Free eval review call" button (`EVAL_CALL_URL`).
3. **Developers → Webhooks:** add the endpoint `https://<domain>/api/webhooks/stripe` with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`. Copy the signing secret.
4. **Settings → Billing → Customer portal:** enable cancellation and plan switching between the two prices.
5. To test locally: run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

To change a price later, create a new Price in Stripe and update the ID and display price in `/admin/plans`. Existing subscribers stay on their current price until you migrate them in Stripe.

## 3. Vercel
1. Import the repository. The framework is detected automatically.
2. Add the environment variables below.
3. `vercel.json` schedules `/api/cron/refresh` every 6 hours (Vercel sends `Authorization: Bearer $CRON_SECRET`). **The Vercel Hobby plan allows only daily crons.** On Hobby, change the schedule to `17 6 * * *` or use Pro.

## 4. Environment variables
| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | everything | e.g. `https://campcheck.com` |
| `DATABASE_URL` | live data, auth, reviews, leads | Railway public proxy URL; server only |
| `AUTH_SECRET`, `AUTH_TRUST_HOST=true` | sign-in | `openssl rand -base64 48` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in (optional) | |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | attendance-proof uploads | Railway Storage Bucket |
| `CAMPGRADE_DEMO_DATA` | — | `true` shows labeled sample camps only while the database has no published camps; set `false` once real camps are loaded |
| `INSIDER_CTA_URL`, `EVAL_CALL_URL` | Insider / eval-call CTAs | default `https://theathletemarket.com` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | paid plans | |
| `ATHLETE_MARKET_BASE_URL`, `ATHLETE_MARKET_CLIENT_ID`, `ATHLETE_MARKET_SHARED_SECRET` | bundled access | see ATHLETE_MARKET_INTEGRATION.md |
| `CRON_SECRET` | scheduled refresh | long random string |
| `IP_HASH_SALT` | abuse detection | long random string |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | optional Cloudflare Turnstile on review (guests) and submit-camp forms | both must be set; Vercel BotID needs no keys |
| `ANTHROPIC_API_KEY` | AI research drafts (optional) | without it, research uses the factual template |
| Provider keys (e.g. `PROVIDER_API_KEY`) | licensed JSON APIs | referenced from a source's `authEnv` config |

## 5. After launch
- Submit `https://<domain>/sitemap.xml` in Google Search Console.
- Check `/admin` daily: discovery queue, pending reviews, reports, failed imports and stale listings.

## Missing dependencies — what is NOT live yet
Live ingestion is **not** running until these exist. The code, admin workflows and tests are ready.

| Dependency | Status | What's needed |
|---|---|---|
| Railway Postgres + bucket | ✅ provisioned (project `campgrade`) | Step 1 |
| Google OAuth client | ❌ not created | See Auth above |
| Lead follow-up (alerts emails, coach calls) | ❌ manual | Leads are stored and exportable at `/admin/leads`; no email provider sends alerts yet |
| Stripe account & prices | ❌ | Step 2 |
| The Athlete Market OAuth + entitlement endpoints | ❌ not built on TAM's side | The 3 endpoints in ATHLETE_MARKET_INTEGRATION.md, plus client ID and shared secret |
| Camp data sources | ❌ none registered | Add sources in `/admin/sources` after reviewing each site's terms and robots.txt |
| Licensed camp or review datasets | ❌ no licenses | Data agreements with providers; then import via `/admin/import` or a JSON-feed source |
| Third-party review platforms | ❌ no authorization | Written permission or API access before storing excerpts or ratings; link-only otherwise |
| Anthropic API key | optional | AI-assisted research drafting |
| Email provider (Elite notifications) | ❌ not wired up | Feature flag exists; choose a provider (e.g. Resend) |
| Shared rate-limit store | optional | The in-memory limiter is per instance; use Upstash Redis for multi-region |

## Security checklist
- [ ] `DATABASE_URL`, `AUTH_SECRET` and S3 keys set only on the server (never `NEXT_PUBLIC_`)
- [ ] `CAMPGRADE_DEMO_DATA=false` in production
- [ ] Stripe webhook secret set; test with `stripe trigger checkout.session.completed`
- [ ] Only trusted staff have the admin role
- [ ] Add CAPTCHA (Turnstile) to sign-up and lead forms if you see abuse (the in-memory rate limiter is per instance)
- [ ] Railway Postgres backups enabled
