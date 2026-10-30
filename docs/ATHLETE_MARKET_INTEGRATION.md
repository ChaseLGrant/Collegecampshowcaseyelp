# The Athlete Market ↔ Camp Check entitlement integration

Goal: a member who already pays The Athlete Market (TAM) for **Recruiting Insider** or **Insider Elite** gets the matching Camp Check plan without paying twice. Ownership is proven by signing in to TAM. **Matching email addresses alone never grants access.**

## Flow
1. The member signs in to Camp Check and clicks **Link The Athlete Market account** on `/account`.
2. Camp Check redirects to `TAM /oauth/authorize` (OAuth 2.0 authorization code with PKCE S256, scope `entitlements:read`, a one-time `state` tied to the Camp Check user and valid for 10 minutes).
3. The member signs in at TAM and approves. TAM redirects to `https://<camp-check-host>/api/athlete-market/callback?code=…&state=…`.
4. Camp Check checks `state` (it must exist, be unexpired and belong to the same signed-in user), exchanges the code, stores the link, and pulls the member's products.
5. Products map to plans through `plans.athlete_market_product_key` (`recruiting_insider` → Insider, `insider_elite` → Elite), with an expiry date.
6. TAM sends a signed webhook whenever a membership changes. Camp Check also re-checks every linked account daily.

One TAM account can be linked to only one Camp Check account.

## Request signing (both directions)
```
X-CG-Client-Id: <client id>             (Camp Check → TAM only)
X-CG-Timestamp: <unix seconds>
X-CG-Signature: hex(HMAC_SHA256(shared_secret, "<timestamp>.<METHOD>.<path+query>.<sha256_hex(body)>"))
```
Requests more than 5 minutes off the current time are rejected. The reference implementation is `src/lib/security/hmac.ts`.

## Endpoints TAM must implement
| Method & path | Purpose | Response |
|---|---|---|
| `GET /oauth/authorize` | Member sign-in and consent | Redirect to `redirect_uri?code&state` |
| `POST /oauth/token` (signed) body `{grant_type, code, code_verifier, redirect_uri, client_id}` | Exchange the code (verify PKCE) | `{ "account_id": "tam_123" }` |
| `GET /api/v1/accounts/{account_id}/entitlements` (signed) | Current products | `{ "account_id": "tam_123", "products": [{ "key": "recruiting_insider", "status": "active", "valid_until": "2026-12-01T00:00:00Z", "subscription_ref": "sub_abc" }] }` |

`status` is one of `active | trialing | past_due | canceled | expired`.

## Endpoints Camp Check provides
| Method & path | Purpose |
|---|---|
| `POST /api/athlete-market/webhook` (signed) body `{"event":"entitlements.updated"|"account.unlinked","account_id":"tam_123"}` | Push changes; Camp Check re-syncs or revokes |
| `GET /api/v1/entitlements?athlete_market_account_id=tam_123` (signed) | TAM can read a linked member's Camp Check tier: `{ linked, tier, features, grants }`. Returns no personal data. |

## Configuration
Set `ATHLETE_MARKET_BASE_URL`, `ATHLETE_MARKET_CLIENT_ID` and `ATHLETE_MARKET_SHARED_SECRET` in Camp Check. Register `https://<camp-check-host>/api/athlete-market/callback` as the redirect URI at TAM.
