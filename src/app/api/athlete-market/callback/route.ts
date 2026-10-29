import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/billing/athlete-market";
import { env } from "@/lib/env";
import { audit } from "@/lib/server/auth";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/account?tam=${q}#athlete-market`, env.siteUrl), 303);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error");

  const db = await getServerSupabase();
  const service = getServiceSupabase();
  if (!db || !service) return back("error");
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return back("signin");

  // State must exist, be unexpired, and belong to the user who started the flow (prevents login CSRF / account swapping).
  const { data: st } = await service.from("oauth_states").select("*").eq("state", state).maybeSingle();
  await service.from("oauth_states").delete().eq("state", state);
  if (!st || st.user_id !== auth.user.id || st.provider !== "athlete_market" || new Date(st.expires_at) < new Date()) return back("expired");

  try {
    const token = await exchangeCode(code, st.code_verifier, `${env.siteUrl}/api/athlete-market/callback`);
    const { data: existing } = await service.from("athlete_market_links").select("user_id").eq("athlete_market_account_id", token.account_id).maybeSingle();
    if (existing && existing.user_id !== auth.user.id) return back("already_linked");
    await service.from("athlete_market_links").upsert({
      user_id: auth.user.id, athlete_market_account_id: token.account_id, status: "active", linked_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    await syncAthleteMarketAccount(service, auth.user.id, token.account_id);
    await audit(auth.user.id, "athlete_market.linked", "athlete_market_links", auth.user.id, { account_id: token.account_id });
    return back("linked");
  } catch (e) {
    console.error("Athlete Market link failed:", (e as Error).message);
    return back("error");
  }
}
