import { z } from "zod";
import { verifyRequest } from "@/lib/security/hmac";
import { json } from "@/lib/server/http";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";
import { getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ event: z.enum(["entitlements.updated", "account.unlinked"]), account_id: z.string().min(1) });

/** The Athlete Market notifies us when a member's subscription changes. Signed with the shared secret. */
export async function POST(req: Request) {
  const raw = await req.text();
  const path = new URL(req.url).pathname;
  const v = verifyRequest({
    secret: process.env.ATHLETE_MARKET_SHARED_SECRET ?? "", timestamp: req.headers.get("x-cg-timestamp"),
    signature: req.headers.get("x-cg-signature"), method: "POST", path, body: raw,
  });
  if (!v.ok) return json({ error: v.reason }, 401);
  const parsed = schema.safeParse(JSON.parse(raw || "null"));
  if (!parsed.success) return json({ error: "Invalid payload" }, 400);
  const db = getServiceSupabase();
  if (!db) return json({ error: "Unavailable" }, 503);

  const { data: link } = await db.from("athlete_market_links").select("user_id,status").eq("athlete_market_account_id", parsed.data.account_id).maybeSingle();
  if (!link) return json({ ok: true, linked: false });
  if (parsed.data.event === "account.unlinked") {
    await db.from("athlete_market_links").update({ status: "revoked" }).eq("user_id", link.user_id);
    await db.from("entitlements").update({ revoked_at: new Date().toISOString() }).eq("user_id", link.user_id).eq("source", "athlete_market").is("revoked_at", null);
    return json({ ok: true });
  }
  if (link.status !== "active") return json({ ok: true, linked: false });
  try {
    const n = await syncAthleteMarketAccount(db, link.user_id, parsed.data.account_id);
    return json({ ok: true, entitlements: n });
  } catch {
    return json({ error: "Sync failed" }, 502);
  }
}
