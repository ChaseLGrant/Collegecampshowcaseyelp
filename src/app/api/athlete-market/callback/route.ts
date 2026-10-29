import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/billing/athlete-market";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env";
import { audit, getSessionUser } from "@/lib/server/auth";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/account?tam=${q}#athlete-market`, env.siteUrl), 303);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error");

  const sql = getSql();
  if (!sql) return back("error");
  const user = await getSessionUser();
  if (!user) return back("signin");

  // State must exist, be unexpired, and belong to the user who started the flow (prevents login CSRF / account swapping).
  const [st] = await sql<{ user_id: string; provider: string; code_verifier: string; expires_at: string }[]>`
    delete from oauth_states where state = ${state} returning user_id, provider, code_verifier, expires_at`;
  if (!st || st.user_id !== user.id || st.provider !== "athlete_market" || new Date(st.expires_at) < new Date()) return back("expired");

  try {
    const token = await exchangeCode(code, st.code_verifier, `${env.siteUrl}/api/athlete-market/callback`);
    const [existing] = await sql<{ user_id: string }[]>`select user_id from athlete_market_links where athlete_market_account_id = ${token.account_id}`;
    if (existing && existing.user_id !== user.id) return back("already_linked");
    await sql`
      insert into athlete_market_links (user_id, athlete_market_account_id, status, linked_at)
      values (${user.id}, ${token.account_id}, 'active', now())
      on conflict (user_id) do update set athlete_market_account_id = excluded.athlete_market_account_id, status = 'active', linked_at = now()`;
    await syncAthleteMarketAccount(sql, user.id, token.account_id);
    await audit(user.id, "athlete_market.linked", "athlete_market_links", user.id, { account_id: token.account_id });
    return back("linked");
  } catch (e) {
    console.error("Athlete Market link failed:", (e as Error).message);
    return back("error");
  }
}
