# Deployment

## 1. Supabase
1. Create a project at supabase.com.
2. Apply the migrations in `supabase/migrations/` in order, using either:
   - Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - the SQL editor: paste each file in order.
3. **Auth → URL configuration:** set the Site URL to your domain and add `https://<domain>/auth/callback` to the redirect URLs. Email magic links work out of the box. To enable Google sign-in, turn on the Google provider.
4. Copy the project URL, anon key and service role key into your environment (step 4).
5. Sign in to the site once, then make yourself admin in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
   ```
   Use `role = 'moderator'` for people who should only moderate reviews.

## 2. Stripe
1. Create two **recurring** Prices: Recruiting Insider ($19.99/mo) and Insider Elite ($99/mo).
2. In `/admin/plans`, paste each `price_...` ID into the matching plan. The checkout button shows "Coming soon" until a price ID is set.
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
| `NEXT_PUBLIC_SITE_URL` | everything | e.g. `https://campgrade.com` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | live data, auth | |
| `SUPABASE_SERVICE_ROLE_KEY` | admin, webhooks, cron | server only — never expose |
| `CAMPGRADE_DEMO_DATA` | — | set `false` in production |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | paid plans | |
| `ATHLETE_MARKET_BASE_URL`, `ATHLETE_MARKET_CLIENT_ID`, `ATHLETE_MARKET_SHARED_SECRET` | bundled access | see ATHLETE_MARKET_INTEGRATION.md |
| `CRON_SECRET` | scheduled refresh | long random string |
| `IP_HASH_SALT` | abuse detection | long random string |
| `ANTHROPIC_API_KEY` | AI research drafts (optional) | without it, research uses the factual template |
| Provider keys (e.g. `PROVIDER_API_KEY`) | licensed JSON APIs | referenced from a source's `authEnv` config |

## 5. After launch
- Submit `https://<domain>/sitemap.xml` in Google Search Console.
- Check `/admin` daily: discovery queue, pending reviews, reports, failed imports and stale listings.

## Missing dependencies — what is NOT live yet
Live ingestion is **not** running until these exist. The code, admin workflows and tests are ready.

| Dependency | Status | What's needed |
|---|---|---|
| Supabase project | ❌ not provisioned | Steps 1 and 4 above |
| Stripe account & prices | ❌ | Step 2 |
| The Athlete Market OAuth + entitlement endpoints | ❌ not built on TAM's side | The 3 endpoints in ATHLETE_MARKET_INTEGRATION.md, plus client ID and shared secret |
| Camp data sources | ❌ none registered | Add sources in `/admin/sources` after reviewing each site's terms and robots.txt |
| Licensed camp or review datasets | ❌ no licenses | Data agreements with providers; then import via `/admin/import` or a JSON-feed source |
| Third-party review platforms | ❌ no authorization | Written permission or API access before storing excerpts or ratings; link-only otherwise |
| Anthropic API key | optional | AI-assisted research drafting |
| Email provider (Elite notifications) | ❌ not wired up | Feature flag exists; choose a provider (e.g. Resend) |
| Shared rate-limit store | optional | The in-memory limiter is per instance; use Upstash Redis for multi-region |

## Security checklist
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set only on the server (never `NEXT_PUBLIC_`)
- [ ] `CAMPGRADE_DEMO_DATA=false` in production
- [ ] Stripe webhook secret set; test with `stripe trigger checkout.session.completed`
- [ ] Only trusted staff have the admin role
- [ ] Supabase Auth email rate limits and CAPTCHA (hCaptcha/Turnstile) enabled if you see abuse
- [ ] Supabase Advisors (security and performance) report no issues
