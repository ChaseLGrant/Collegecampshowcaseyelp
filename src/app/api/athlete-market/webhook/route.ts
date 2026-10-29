import { z } from "zod";
import { verifyRequest } from "@/lib/security/hmac";
import { json } from "@/lib/server/http";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";
import { getSql } from "@/lib/db";

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
  const db = getSql();
  if (!db) return json({ error: "Unavailable" }, 503);

  const [link] = await db<{ user_id: string; status: string }[]>`select user_id, status from athlete_market_links where athlete_market_account_id = ${parsed.data.account_id}`;
  if (!link) return json({ ok: true, linked: false });
  if (parsed.data.event === "account.unlinked") {
    await db`update athlete_market_links set status = 'revoked' where user_id = ${link.user_id}`;
    await db`update entitlements set revoked_at = now() where user_id = ${link.user_id} and source = 'athlete_market' and revoked_at is null`;
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
