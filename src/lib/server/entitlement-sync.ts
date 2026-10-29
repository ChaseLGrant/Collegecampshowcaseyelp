import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripeSubscriptionToEntitlement } from "../billing/entitlements";
import { fetchTamProducts, tamProductsToEntitlements } from "../billing/athlete-market";
import { periodEnd } from "../billing/stripe";
import { getPlans } from "./access";

/** Upserts subscription + entitlement rows from a Stripe subscription object. Idempotent. */
export async function syncStripeSubscription(db: SupabaseClient, sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  const priceId = sub.items.data[0]?.price?.id;
  if (!userId || !priceId) throw new Error(`Subscription ${sub.id} missing user_id metadata or price`);
  const { data: plan } = await db.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
  const planId = plan?.id ?? sub.metadata?.plan_id;
  if (!planId) throw new Error(`No plan configured for Stripe price ${priceId}`);

  const end = periodEnd(sub);
  await db.from("subscriptions").upsert({
    user_id: userId, plan_id: planId, provider: "stripe", external_id: sub.id, status: sub.status,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end, updated_at: new Date().toISOString(),
  }, { onConflict: "provider,external_id" });

  const ent = stripeSubscriptionToEntitlement({ id: sub.id, status: sub.status, currentPeriodEnd: end, endedAt: sub.ended_at });
  await db.from("entitlements").upsert({
    user_id: userId, plan_id: planId, source: "stripe", source_ref: sub.id,
    expires_at: ent.expiresAt, revoked_at: ent.revoke ? new Date().toISOString() : null,
  }, { onConflict: "source,source_ref" });
}

/** Re-reads a linked TAM account's products and updates bundled entitlements. */
export async function syncAthleteMarketAccount(db: SupabaseClient, userId: string, accountId: string) {
  const products = await fetchTamProducts(accountId);
  const plans = await getPlans();
  const rows = tamProductsToEntitlements(products, plans);
  const now = new Date().toISOString();
  for (const r of rows) {
    await db.from("entitlements").upsert({
      user_id: userId, plan_id: r.planId, source: "athlete_market", source_ref: r.sourceRef,
      expires_at: r.expiresAt, revoked_at: r.revoke ? now : null,
    }, { onConflict: "source,source_ref" });
  }
  // Products no longer reported by TAM are expired.
  const refs = rows.map((r) => r.sourceRef);
  const { data: existing } = await db.from("entitlements").select("id,source_ref").eq("user_id", userId).eq("source", "athlete_market").is("revoked_at", null);
  for (const e of existing ?? []) {
    if (!refs.includes(e.source_ref)) await db.from("entitlements").update({ revoked_at: now }).eq("id", e.id);
  }
  await db.from("athlete_market_links").update({ last_synced_at: now }).eq("user_id", userId);
  return rows.length;
}
