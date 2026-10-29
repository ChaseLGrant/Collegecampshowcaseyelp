import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { json } from "@/lib/server/http";
import { syncStripeSubscription } from "@/lib/server/entitlement-sync";
import { getSql } from "@/lib/db";

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
  const db = getSql();
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
  const [seen] = await db<{ processed_at: string | null }[]>`select processed_at from stripe_events where id = ${event.id}`;
  if (seen?.processed_at) return json({ received: true, duplicate: true });
  if (!seen) await db`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict (id) do nothing`;

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
    await db`update stripe_events set processed_at = now(), error = null where id = ${event.id}`;
    return json({ received: true });
  } catch (e) {
    await db`update stripe_events set error = ${(e as Error).message.slice(0, 500)} where id = ${event.id}`;
    return json({ error: "Processing failed" }, 500); // Stripe will retry
  }
}
