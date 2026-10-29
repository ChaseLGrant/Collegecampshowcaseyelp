import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { env, stripeConfigured } from "@/lib/env";
import { sameOrigin } from "@/lib/server/http";
import { getServerSupabase } from "@/lib/supabase/server";

/** Stripe Customer Portal: change plan, update card, cancel. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!stripeConfigured()) return new NextResponse("Billing is not configured", { status: 503 });
  const db = await getServerSupabase();
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login?next=/account", env.siteUrl), 303);
  const { data: customer } = await db.from("billing_customers").select("stripe_customer_id").eq("user_id", auth.user.id).maybeSingle();
  if (!customer) return NextResponse.redirect(new URL("/pricing", env.siteUrl), 303);
  const portal = await getStripe().billingPortal.sessions.create({ customer: customer.stripe_customer_id, return_url: `${env.siteUrl}/account` });
  return NextResponse.redirect(portal.url, 303);
}
