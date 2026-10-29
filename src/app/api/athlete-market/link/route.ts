import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/billing/athlete-market";
import { athleteMarketConfigured, env } from "@/lib/env";
import { pkceChallenge, randomToken } from "@/lib/security/hmac";
import { sameOrigin } from "@/lib/server/http";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

/** Starts account linking. The customer must sign in at The Athlete Market to prove they own the account. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!athleteMarketConfigured()) return NextResponse.redirect(new URL("/account?tam=unavailable", env.siteUrl), 303);
  const db = await getServerSupabase();
  const service = getServiceSupabase();
  if (!db || !service) return new NextResponse("Unavailable", { status: 503 });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login?next=/account", env.siteUrl), 303);

  const state = randomToken(24);
  const verifier = randomToken(48);
  await service.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  await service.from("oauth_states").insert({
    state, user_id: auth.user.id, provider: "athlete_market", code_verifier: verifier,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  const url = buildAuthorizeUrl({ state, codeChallenge: pkceChallenge(verifier), redirectUri: `${env.siteUrl}/api/athlete-market/callback` });
  return NextResponse.redirect(url, 303);
}
