import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { env, stripeConfigured } from "@/lib/env";
import { sameOrigin } from "@/lib/server/http";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (!stripeConfigured()) return new NextResponse("Billing is not configured", { status: 503 });
  const db = await getServerSupabase();
  const service = getServiceSupabase();
  if (!db || !service) return new NextResponse("Unavailable", { status: 503 });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login?next=/pricing", env.siteUrl), 303);

  const form = await req.formData();
  const planId = String(form.get("planId") ?? "");
  const { data: plan } = await service.from("plans").select("id,stripe_price_id,active").eq("id", planId).maybeSingle();
  if (!plan?.active || !plan.stripe_price_id) return new NextResponse("Plan unavailable", { status: 400 });

  const stripe = getStripe();
  let { data: customer } = await service.from("billing_customers").select("stripe_customer_id").eq("user_id", auth.user.id).maybeSingle();
  if (!customer) {
    const created = await stripe.customers.create({ email: auth.user.email ?? undefined, metadata: { user_id: auth.user.id } });
    await service.from("billing_customers").insert({ user_id: auth.user.id, stripe_customer_id: created.id });
    customer = { stripe_customer_id: created.id };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripe_customer_id,
    client_reference_id: auth.user.id,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { user_id: auth.user.id, plan_id: plan.id } },
    metadata: { user_id: auth.user.id, plan_id: plan.id },
    success_url: `${env.siteUrl}/account?checkout=success`,
    cancel_url: `${env.siteUrl}/pricing?checkout=cancelled`,
  });
  return NextResponse.redirect(session.url!, 303);
}
