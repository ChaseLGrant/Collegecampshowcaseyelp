import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { json } from "@/lib/server/http";
import { syncStripeSubscription } from "@/lib/server/entitlement-sync";
import { getServiceSupabase } from "@/lib/supabase/server";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.payment_failed",
  "invoice.paid",
]);

/** Verified Stripe webhook. Signature is checked against the raw body; events are processed idempotently. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = getServiceSupabase();
  if (!secret || !db) return json({ error: "Not configured" }, 503);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing signature" }, 400);
  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return json({ error: "Invalid signature" }, 400);
  }
  if (!HANDLED.has(event.type)) return json({ received: true });

  // Idempotency: record the event id first; a duplicate delivery that already succeeded is skipped.
  const { data: seen } = await db.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
  if (seen?.processed_at) return json({ received: true, duplicate: true });
  if (!seen) await db.from("stripe_events").insert({ id: event.id, type: event.type });

  try {
    let subscriptionId: string | null = null;
    const obj = event.data.object as unknown as Record<string, unknown>;
    if (event.type === "checkout.session.completed") subscriptionId = (obj.subscription as string) ?? null;
    else if (event.type.startsWith("customer.subscription.")) subscriptionId = obj.id as string;
    else if (event.type.startsWith("invoice.")) {
      const parent = obj.parent as { subscription_details?: { subscription?: string } } | undefined;
      subscriptionId = (obj.subscription as string) ?? parent?.subscription_details?.subscription ?? null;
    }
    if (subscriptionId) {
      // Always re-fetch: never trust event ordering or payload staleness.
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await syncStripeSubscription(db, sub);
    }
    await db.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return json({ received: true });
  } catch (e) {
    await db.from("stripe_events").update({ error: (e as Error).message.slice(0, 500) }).eq("id", event.id);
    return json({ error: "Processing failed" }, 500); // Stripe will retry
  }
}
