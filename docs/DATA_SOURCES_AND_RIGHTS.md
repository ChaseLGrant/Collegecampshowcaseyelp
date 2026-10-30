# Data sources & content rights

Camp Check only uses data it is allowed to use. These rules are enforced in code, not just policy.

## Before any source runs
`ingestionPolicy()` (src/lib/ingestion/policy.ts) blocks a source unless all of the following are true:
- its **content rights** are set (anything except `unknown` or `prohibited`)
- an admin has ticked **"I reviewed this source's terms and robots.txt"**
- web sources follow robots.txt (this cannot be turned off)
- it is enabled (scheduled runs only)

## How we fetch
`PoliteFetcher` (src/lib/ingestion/fetcher.ts):
- reads robots.txt first. If robots.txt returns a server error (5xx), the site is skipped.
- follows `Crawl-delay` and the per-source requests-per-minute limit
- identifies itself as `CampCheckBot/1.0 (+<site>/bot)`, sends no cookies or credentials, and never uses a fake browser identity
- **stops** on 401/403 (access restricted), 429 (rate limited), login forms and bot-challenge pages, and records the run as `blocked`. It never retries around or bypasses them.
- licensed APIs are called with credentials the provider issued, stored in env vars and referenced by name

## Content rights values
| Value | Camp facts | External review rating | External excerpt |
|---|---|---|---|
| `facts_only` | ✅ facts rewritten in our own words | ❌ link only | ❌ |
| `link_only` | ✅ | ❌ link only | ❌ |
| `licensed_display` | ✅ | ✅ if the record allows | ❌ |
| `licensed_excerpt` | ✅ | ✅ | ✅ (≤ 600 chars) |
| `prohibited` / `unknown` | blocked | blocked | blocked |

Reviewer identities from external platforms are **never** imported by CSV, and are shown only when a record explicitly permits it.

## What we never do
- Invent missing facts. Unknown prices, dates and similar fields stay blank and are listed as "missing" in the queue.
- Generate or import fake reviews, or turn AI research into reviews.
- Blend external ratings into Camp Check's star rating.
- Let any automated process write to community reviews. A database trigger blocks it.

## CSV formats
**Camps** (`/admin/import`): `name, sport, event_type, institution, organizer, city, state, venue, start_date, end_date, price, registration_url, description, eligibility, participating_colleges, source_url`. `name` and `source_url` are required. Separate colleges with `;`. Participating colleges are stored as **advertised (unverified)** until an admin verifies each one with an official source.

**External reviews**: `platform_name, source_url, referenced_name, sport, review_date, rating, rating_scale, excerpt, reviewer_display, attribution, provenance_type, city, state, organizer`. `platform_name`, `source_url`, `referenced_name` and `attribution` are required. `provenance_type` is one of `licensed_dataset | authorized_api | public_page | organizer_testimonial | editorial`.

## Source config examples
```json
{ "urls": ["https://athletics.example.edu/sports/baseball/camps"], "defaults": { "sport": "baseball", "institution": "Example University" } }
```
```json
{ "url": "https://api.provider.example/v1/events", "itemsPath": "data.events", "authEnv": "PROVIDER_API_KEY",
  "fields": { "name": "title", "sport": "sport", "startDate": "dates.start", "city": "venue.city", "state": "venue.state", "price": "price", "registrationUrl": "url", "sourceUrl": "url" } }
```
