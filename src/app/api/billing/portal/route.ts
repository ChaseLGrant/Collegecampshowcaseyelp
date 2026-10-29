import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { env, stripeConfigured } from "@/lib/env";
import { sameOrigin } from "@/lib/server/http";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";

/** Stripe Customer Portal: change plan, update card, cancel. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!stripeConfigured()) return new NextResponse("Billing is not configured", { status: 503 });
  const sql = getSql();
  if (!sql) return new NextResponse("Unavailable", { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/account", env.siteUrl), 303);
  const [customer] = await sql<{ stripe_customer_id: string }[]>`select stripe_customer_id from billing_customers where user_id = ${user.id}`;
  if (!customer) return NextResponse.redirect(new URL("/pricing", env.siteUrl), 303);
  const portal = await getStripe().billingPortal.sessions.create({ customer: customer.stripe_customer_id, return_url: `${env.siteUrl}/account` });
  return NextResponse.redirect(portal.url, 303);
}
