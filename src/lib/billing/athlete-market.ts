import { z } from "zod";
import { signRequest } from "../security/hmac";
import type { Plan } from "./plans";

/**
 * Integration contract with The Athlete Market (TAM) account service.
 * See docs/ATHLETE_MARKET_INTEGRATION.md for the full spec TAM must implement.
 *
 * Ownership is proven by the customer signing in to TAM (OAuth 2.0 authorization
 * code + PKCE). CampGrade NEVER grants bundled access just because emails match.
 */

export const tamProductsSchema = z.object({
  account_id: z.string().min(1),
  products: z.array(z.object({
    key: z.string(),                       // e.g. "recruiting_insider", "insider_elite"
    status: z.enum(["active", "trialing", "past_due", "canceled", "expired"]),
    valid_until: z.string().datetime({ offset: true }).nullable(),
    subscription_ref: z.string().min(1),
  })),
});
export type TamProducts = z.infer<typeof tamProductsSchema>;

export const tamTokenSchema = z.object({ account_id: z.string().min(1) });

/** Maps TAM products to CampGrade entitlement rows. Unknown products are ignored. */
export function tamProductsToEntitlements(data: TamProducts, plans: Plan[], now = new Date()) {
  const byKey = new Map(plans.filter((p) => p.athleteMarketProductKey).map((p) => [p.athleteMarketProductKey!, p]));
  return data.products.flatMap((p) => {
    const plan = byKey.get(p.key);
    if (!plan) return [];
    const granting = p.status === "active" || p.status === "trialing" || p.status === "past_due";
    // If TAM omits valid_until, grant for 24h and rely on re-sync / webhook.
    const expiresAt = granting
      ? p.valid_until ?? new Date(now.getTime() + 86400000).toISOString()
      : now.toISOString();
    return [{
      planId: plan.id,
      source: "athlete_market" as const,
      sourceRef: `${data.account_id}:${p.subscription_ref}`,
      expiresAt,
      revoke: !granting,
    }];
  });
}

function config() {
  const base = process.env.ATHLETE_MARKET_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.ATHLETE_MARKET_CLIENT_ID;
  const secret = process.env.ATHLETE_MARKET_SHARED_SECRET;
  if (!base || !clientId || !secret) throw new Error("The Athlete Market integration is not configured");
  return { base, clientId, secret };
}

export function buildAuthorizeUrl(opts: { state: string; codeChallenge: string; redirectUri: string }): string {
  const { base, clientId } = config();
  const u = new URL(`${base}/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", "entitlements:read");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

async function signedFetch(method: "GET" | "POST", path: string, body?: unknown) {
  const { base, clientId, secret } = config();
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-cg-client-id": clientId,
      "x-cg-timestamp": String(ts),
      "x-cg-signature": signRequest(secret, ts, method, path, raw),
    },
    body: raw || undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`The Athlete Market ${path} responded ${res.status}`);
  return res.json();
}

export async function exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
  const { clientId } = config();
  const json = await signedFetch("POST", "/oauth/token", {
    grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: redirectUri, client_id: clientId,
  });
  return tamTokenSchema.parse(json);
}

export async function fetchTamProducts(accountId: string): Promise<TamProducts> {
  const json = await signedFetch("GET", `/api/v1/accounts/${encodeURIComponent(accountId)}/entitlements`);
  const parsed = tamProductsSchema.parse(json);
  if (parsed.account_id !== accountId) throw new Error("Account mismatch in entitlement response");
  return parsed;
}
