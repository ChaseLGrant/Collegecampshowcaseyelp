import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { env, stripeConfigured } from "@/lib/env";
import { sameOrigin } from "@/lib/server/http";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!stripeConfigured()) return new NextResponse("Billing is not configured", { status: 503 });
  const sql = getSql();
  if (!sql) return new NextResponse("Unavailable", { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/pricing", env.siteUrl), 303);

  const form = await req.formData();
  const planId = String(form.get("planId") ?? "");
  const [plan] = await sql<{ id: string; stripe_price_id: string | null; active: boolean }[]>`select id, stripe_price_id, active from plans where id = ${planId}`;
  if (!plan?.active || !plan.stripe_price_id) return new NextResponse("Plan unavailable", { status: 400 });

  const stripe = getStripe();
  let [customer] = await sql<{ stripe_customer_id: string }[]>`select stripe_customer_id from billing_customers where user_id = ${user.id}`;
  if (!customer) {
    const created = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
    await sql`insert into billing_customers (user_id, stripe_customer_id) values (${user.id}, ${created.id}) on conflict (user_id) do nothing`;
    customer = { stripe_customer_id: created.id };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripe_customer_id,
    client_reference_id: user.id,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { user_id: user.id, plan_id: plan.id } },
    metadata: { user_id: user.id, plan_id: plan.id },
    success_url: `${env.siteUrl}/account?checkout=success`,
    cancel_url: `${env.siteUrl}/pricing?checkout=cancelled`,
  });
  return NextResponse.redirect(session.url!, 303);
}
