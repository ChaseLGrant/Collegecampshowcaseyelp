import { DEFAULT_FEATURE_TIER, TIER_RANK, type Feature, type Plan, type Tier } from "./plans";

export interface EntitlementRecord {
  planId: string;
  source: "stripe" | "athlete_market" | "admin";
  sourceRef: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AccessSummary {
  tier: Tier;
  features: Feature[];
  /** Active grants that produced this access (for account page and the entitlement API). */
  grants: { planId: string; source: EntitlementRecord["source"]; expiresAt: string | null }[];
}

export function isActive(e: EntitlementRecord, now = new Date()): boolean {
  if (e.revokedAt) return false;
  if (new Date(e.startsAt) > now) return false;
  if (e.expiresAt && new Date(e.expiresAt) <= now) return false;
  return true;
}

/** Combines every active grant (Stripe, The Athlete Market bundle, admin) into one access level. */
export function resolveAccess(entitlements: EntitlementRecord[], plans: Plan[], now = new Date()): AccessSummary {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const active = entitlements.filter((e) => isActive(e, now) && planById.has(e.planId));
  let tier: Tier = "free";
  const features = new Set<Feature>(plans.find((p) => p.tier === "free")?.features ?? freeFeatures());
  for (const e of active) {
    const plan = planById.get(e.planId)!;
    if (TIER_RANK[plan.tier] > TIER_RANK[tier]) tier = plan.tier;
    plan.features.forEach((f) => features.add(f));
  }
  return {
    tier,
    features: [...features],
    grants: active.map((e) => ({ planId: e.planId, source: e.source, expiresAt: e.expiresAt })),
  };
}

function freeFeatures(): Feature[] {
  return (Object.keys(DEFAULT_FEATURE_TIER) as Feature[]).filter((f) => DEFAULT_FEATURE_TIER[f] === "free");
}

export function hasFeature(access: Pick<AccessSummary, "features">, feature: Feature): boolean {
  return access.features.includes(feature);
}

export const FREE_ACCESS: AccessSummary = { tier: "free", features: freeFeatures(), grants: [] };

/** Days of access kept after a failed renewal while Stripe retries the payment. */
export const PAYMENT_GRACE_DAYS = 3;

/**
 * Converts a Stripe subscription state into an entitlement window.
 * Returns null expiresAt=now (i.e. revoke) for statuses that should not grant access.
 */
export function stripeSubscriptionToEntitlement(sub: {
  id: string; status: string; currentPeriodEnd: number | null; endedAt?: number | null;
}, now = new Date()): { expiresAt: string; revoke: boolean } {
  const granting = ["active", "trialing", "past_due"];
  if (!granting.includes(sub.status)) {
    const endedAt = sub.endedAt ? new Date(sub.endedAt * 1000) : now;
    return { expiresAt: endedAt.toISOString(), revoke: true };
  }
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : new Date(now.getTime() + 86400000);
  const grace = sub.status === "past_due" ? PAYMENT_GRACE_DAYS : 1;
  return { expiresAt: new Date(end.getTime() + grace * 86400000).toISOString(), revoke: false };
}
