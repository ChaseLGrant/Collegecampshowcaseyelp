import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/billing/athlete-market";
import { getSql } from "@/lib/db";
import { athleteMarketConfigured, env } from "@/lib/env";
import { pkceChallenge, randomToken } from "@/lib/security/hmac";
import { getSessionUser } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/http";

/** Starts account linking. The customer must sign in at The Athlete Market to prove they own the account. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!athleteMarketConfigured()) return NextResponse.redirect(new URL("/account?tam=unavailable", env.siteUrl), 303);
  const sql = getSql();
  if (!sql) return new NextResponse("Unavailable", { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/account", env.siteUrl), 303);

  const state = randomToken(24);
  const verifier = randomToken(48);
  await sql`delete from oauth_states where expires_at < now()`;
  await sql`
    insert into oauth_states (state, user_id, provider, code_verifier, expires_at)
    values (${state}, ${user.id}, 'athlete_market', ${verifier}, ${new Date(Date.now() + 10 * 60_000).toISOString()})`;
  const url = buildAuthorizeUrl({ state, codeChallenge: pkceChallenge(verifier), redirectUri: `${env.siteUrl}/api/athlete-market/callback` });
  return NextResponse.redirect(url, 303);
}
