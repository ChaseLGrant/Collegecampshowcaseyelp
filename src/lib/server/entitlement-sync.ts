import "server-only";
import type Stripe from "stripe";
import { stripeSubscriptionToEntitlement } from "../billing/entitlements";
import { fetchTamProducts, tamProductsToEntitlements } from "../billing/athlete-market";
import { periodEnd } from "../billing/stripe";
import type { Sql } from "../db";
import { getPlans } from "./access";

/** Upserts subscription + entitlement rows from a Stripe subscription object. Idempotent. */
export async function syncStripeSubscription(sql: Sql, sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  const priceId = sub.items.data[0]?.price?.id;
  if (!userId || !priceId) throw new Error(`Subscription ${sub.id} missing user_id metadata or price`);
  const [plan] = await sql<{ id: string }[]>`select id from plans where stripe_price_id = ${priceId}`;
  const planId = plan?.id ?? sub.metadata?.plan_id;
  if (!planId) throw new Error(`No plan configured for Stripe price ${priceId}`);

  const end = periodEnd(sub);
  const endIso = end ? new Date(end * 1000).toISOString() : null;
  await sql`
    insert into subscriptions (user_id, plan_id, provider, external_id, status, current_period_end, cancel_at_period_end, updated_at)
    values (${userId}, ${planId}, 'stripe', ${sub.id}, ${sub.status}, ${endIso}, ${sub.cancel_at_period_end}, now())
    on conflict (provider, external_id) do update set
      user_id = excluded.user_id, plan_id = excluded.plan_id, status = excluded.status,
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()`;

  const ent = stripeSubscriptionToEntitlement({ id: sub.id, status: sub.status, currentPeriodEnd: end, endedAt: sub.ended_at });
  await sql`
    insert into entitlements (user_id, plan_id, source, source_ref, expires_at, revoked_at)
    values (${userId}, ${planId}, 'stripe', ${sub.id}, ${ent.expiresAt}, ${ent.revoke ? new Date().toISOString() : null})
    on conflict (source, source_ref) do update set
      user_id = excluded.user_id, plan_id = excluded.plan_id, expires_at = excluded.expires_at, revoked_at = excluded.revoked_at`;
}

/** Re-reads a linked TAM account's products and updates bundled entitlements. */
export async function syncAthleteMarketAccount(sql: Sql, userId: string, accountId: string) {
  const products = await fetchTamProducts(accountId);
  const plans = await getPlans();
  const rows = tamProductsToEntitlements(products, plans);
  const now = new Date().toISOString();
  for (const r of rows) {
    await sql`
      insert into entitlements (user_id, plan_id, source, source_ref, expires_at, revoked_at)
      values (${userId}, ${r.planId}, 'athlete_market', ${r.sourceRef}, ${r.expiresAt}, ${r.revoke ? now : null})
      on conflict (source, source_ref) do update set
        user_id = excluded.user_id, plan_id = excluded.plan_id, expires_at = excluded.expires_at, revoked_at = excluded.revoked_at`;
  }
  // Products no longer reported by TAM are expired.
  const refs = rows.map((r) => r.sourceRef);
  await sql`
    update entitlements set revoked_at = ${now}
    where user_id = ${userId} and source = 'athlete_market' and revoked_at is null and not (source_ref = any(${refs}::text[]))`;
  await sql`update athlete_market_links set last_synced_at = ${now} where user_id = ${userId}`;
  return rows.length;
}
