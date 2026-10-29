import { describe, expect, it } from "vitest";
import { assessSpam, bodyFingerprint, reviewInputSchema } from "@/lib/reviews/validation";

const good = {
  campId: "00000000-0000-4000-8000-000000000001",
  attendeeRole: "parent",
  ratings: { value: 4, instruction: 5, exposure: 3, organization: 4, overall: 4 },
  title: "Well run, good instruction",
  body: "The staff ran position groups all morning and the coaches gave every kid individual feedback before the game.",
  confirmAdult: true,
  confirmFirsthand: true,
  elapsedMs: 90000,
};

describe("review validation", () => {
  it("accepts a complete review", () => {
    expect(reviewInputSchema.safeParse(good).success).toBe(true);
  });
  it("requires the 18+ confirmation", () => {
    const r = reviewInputSchema.safeParse({ ...good, confirmAdult: false });
    expect(r.success).toBe(false);
  });
  it("requires all five rating categories", () => {
    const r = reviewInputSchema.safeParse({ ...good, ratings: { ...good.ratings, exposure: undefined } });
    expect(r.success).toBe(false);
  });
  it("rejects short reviews", () => {
    expect(reviewInputSchema.safeParse({ ...good, body: "Great camp!" }).success).toBe(false);
  });
});

describe("assessSpam", () => {
  it("publishes clean reviews", () => {
    expect(assessSpam(good).decision).toBe("publish");
  });
  it("rejects honeypot submissions", () => {
    expect(assessSpam({ ...good, website: "http://spam" }).decision).toBe("reject");
  });
  it("sends promotional content with links to moderation or rejection", () => {
    const r = assessSpam({ ...good, body: `${good.body} Use promo code SAVE20 at https://example.com` });
    expect(r.decision).not.toBe("publish");
  });
  it("rejects duplicates of existing reviews submitted quickly", () => {
    expect(assessSpam({ ...good, elapsedMs: 1000 }, { duplicateBodyExists: true }).decision).toBe("reject");
  });
  it("moderates bursts from one account", () => {
    expect(assessSpam(good, { recentReviewsByUser: 3 }).decision).toBe("publish");
    expect(assessSpam(good, { recentReviewsByUser: 6 }).decision).toBe("moderate");
  });
});

describe("bodyFingerprint", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(bodyFingerprint("Great  camp, LOVED it!")).toBe(bodyFingerprint("great camp loved it"));
    expect(bodyFingerprint("great camp")).not.toBe(bodyFingerprint("bad camp"));
  });
});
