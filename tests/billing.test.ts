import { describe, expect, it } from "vitest";
import { hasFeature, isActive, resolveAccess, stripeSubscriptionToEntitlement, type EntitlementRecord } from "@/lib/billing/entitlements";
import { DEFAULT_PLANS } from "@/lib/billing/plans";
import { tamProductsSchema, tamProductsToEntitlements } from "@/lib/billing/athlete-market";
import { signRequest, verifyRequest } from "@/lib/security/hmac";

const now = new Date("2026-10-01T00:00:00Z");
const ent = (over: Partial<EntitlementRecord>): EntitlementRecord => ({ planId: "insider", source: "stripe", sourceRef: "sub_1", startsAt: "2026-01-01T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z", revokedAt: null, ...over });

describe("resolveAccess", () => {
  it("defaults to free with free features", () => {
    const a = resolveAccess([], DEFAULT_PLANS, now);
    expect(a.tier).toBe("free");
    expect(hasFeature(a, "search")).toBe(true);
    expect(hasFeature(a, "premium_research")).toBe(false);
  });
  it("takes the highest active tier across Stripe and bundled grants", () => {
    const a = resolveAccess([ent({}), ent({ planId: "elite", source: "athlete_market", sourceRef: "tam:1" })], DEFAULT_PLANS, now);
    expect(a.tier).toBe("elite");
    expect(hasFeature(a, "camp_matching")).toBe(true);
    expect(a.grants).toHaveLength(2);
  });
  it("ignores expired, revoked and future grants", () => {
    expect(isActive(ent({ expiresAt: "2026-09-01T00:00:00Z" }), now)).toBe(false);
    expect(isActive(ent({ revokedAt: "2026-09-15T00:00:00Z" }), now)).toBe(false);
    expect(isActive(ent({ startsAt: "2026-12-01T00:00:00Z" }), now)).toBe(false);
    expect(resolveAccess([ent({ expiresAt: "2026-09-01T00:00:00Z" })], DEFAULT_PLANS, now).tier).toBe("free");
  });
  it("public discovery features are always free", () => {
    for (const f of ["search", "basic_listings", "community_reviews", "review_submission"] as const) {
      expect(hasFeature(resolveAccess([], DEFAULT_PLANS, now), f)).toBe(true);
    }
  });
});

describe("Stripe subscription → entitlement", () => {
  const end = Math.floor(new Date("2026-11-01T00:00:00Z").getTime() / 1000);
  it("grants through the period plus a day of slack", () => {
    const r = stripeSubscriptionToEntitlement({ id: "s", status: "active", currentPeriodEnd: end }, now);
    expect(r.revoke).toBe(false);
    expect(r.expiresAt).toBe("2026-11-02T00:00:00.000Z");
  });
  it("gives a short grace period while payment is retried", () => {
    const r = stripeSubscriptionToEntitlement({ id: "s", status: "past_due", currentPeriodEnd: end }, now);
    expect(r.expiresAt).toBe("2026-11-04T00:00:00.000Z");
  });
  it("revokes canceled or unpaid subscriptions", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"]) {
      expect(stripeSubscriptionToEntitlement({ id: "s", status, currentPeriodEnd: end }, now).revoke).toBe(true);
    }
  });
});

describe("The Athlete Market bundle", () => {
  const payload = tamProductsSchema.parse({
    account_id: "tam_42",
    products: [
      { key: "recruiting_insider", status: "active", valid_until: "2026-12-01T00:00:00Z", subscription_ref: "a" },
      { key: "insider_elite", status: "canceled", valid_until: null, subscription_ref: "b" },
      { key: "unrelated_product", status: "active", valid_until: null, subscription_ref: "c" },
    ],
  });
  it("maps TAM products to CampGrade plans and revokes canceled ones", () => {
    const rows = tamProductsToEntitlements(payload, DEFAULT_PLANS, now);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ planId: "insider", sourceRef: "tam_42:a", revoke: false, expiresAt: "2026-12-01T00:00:00Z" });
    expect(rows[1]).toMatchObject({ planId: "elite", revoke: true });
  });
  it("rejects malformed partner payloads", () => {
    expect(tamProductsSchema.safeParse({ account_id: "x", products: [{ key: "k", status: "lifetime" }] }).success).toBe(false);
  });
});

describe("HMAC request signing", () => {
  const secret = "s3cret";
  const ts = 1_790_000_000;
  const sig = signRequest(secret, ts, "POST", "/api/athlete-market/webhook", '{"a":1}');
  const base = { secret, timestamp: String(ts), signature: sig, method: "POST", path: "/api/athlete-market/webhook", body: '{"a":1}', now: ts * 1000 };
  it("accepts a valid signature", () => expect(verifyRequest(base).ok).toBe(true));
  it("rejects tampered bodies, paths and methods", () => {
    expect(verifyRequest({ ...base, body: '{"a":2}' }).ok).toBe(false);
    expect(verifyRequest({ ...base, path: "/other" }).ok).toBe(false);
    expect(verifyRequest({ ...base, method: "GET" }).ok).toBe(false);
  });
  it("rejects replays outside the time window and missing secrets", () => {
    expect(verifyRequest({ ...base, now: (ts + 600) * 1000 }).ok).toBe(false);
    expect(verifyRequest({ ...base, secret: "" }).ok).toBe(false);
    expect(verifyRequest({ ...base, signature: "zz" }).ok).toBe(false);
  });
});
