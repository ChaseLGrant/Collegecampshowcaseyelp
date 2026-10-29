import { verifyRequest } from "@/lib/security/hmac";
import { json } from "@/lib/server/http";
import { loadAccessForUser } from "@/lib/server/access";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Cross-product entitlement API (server-to-server only).
 * GET /api/v1/entitlements?athlete_market_account_id=...
 * Signed with HMAC (see src/lib/security/hmac.ts). Returns only access level and
 * grants — never email or personal data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const v = verifyRequest({
    secret: process.env.ATHLETE_MARKET_SHARED_SECRET ?? "", timestamp: req.headers.get("x-cg-timestamp"),
    signature: req.headers.get("x-cg-signature"), method: "GET", path: url.pathname + url.search,
  });
  if (!v.ok) return json({ error: v.reason }, 401);
  const accountId = url.searchParams.get("athlete_market_account_id");
  if (!accountId) return json({ error: "athlete_market_account_id required" }, 400);
  const db = getServiceSupabase();
  if (!db) return json({ error: "Unavailable" }, 503);
  const { data: link } = await db.from("athlete_market_links").select("user_id,status").eq("athlete_market_account_id", accountId).maybeSingle();
  if (!link || link.status !== "active") return json({ linked: false, tier: "free", grants: [] });
  const access = await loadAccessForUser(link.user_id, true);
  return json({ linked: true, tier: access.tier, features: access.features, grants: access.grants });
}
