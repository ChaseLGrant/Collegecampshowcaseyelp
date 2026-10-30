import { describe, expect, it } from "vitest";
import { mapReviewRow } from "@/lib/data/mappers";
import { prepareQueueItems } from "@/lib/ingestion/pipeline";
import { GUEST_EMAIL_DOMAIN, guestEmailFor, guestFieldsSchema, isGuestEmail, shortDisplayName } from "@/lib/reviews/guest";
import { reviewInputSchema } from "@/lib/reviews/validation";
import { isSportId } from "@/lib/sports";

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
const guestSchema = reviewInputSchema.merge(guestFieldsSchema);

describe("guest identity", () => {
  it("uses a synthetic address on the reserved .invalid domain", () => {
    const e = guestEmailFor("2f1c0a52-7d1b-4d7e-9c43-7d2a1b3c4d5e");
    expect(e).toBe(`guest+2f1c0a52-7d1b-4d7e-9c43-7d2a1b3c4d5e@${GUEST_EMAIL_DOMAIN}`);
    expect(e.endsWith(".invalid")).toBe(true);
    expect(isGuestEmail(e)).toBe(true);
    expect(isGuestEmail(e.toUpperCase())).toBe(true);
  });
  it("does not treat real addresses as guests", () => {
    expect(isGuestEmail("sarah@example.com")).toBe(false);
    expect(isGuestEmail("guest@campgrade.invalid.com")).toBe(false);
    expect(isGuestEmail(null)).toBe(false);
  });
  it("shortens public names to first name + last initial", () => {
    expect(shortDisplayName("Sarah Miller")).toBe("Sarah M.");
    expect(shortDisplayName("  sarah   ann  o'neil ")).toBe("Sarah O.");
    expect(shortDisplayName("Sarah")).toBe("Sarah");
    expect(shortDisplayName("")).toBeNull();
    expect(shortDisplayName(null)).toBeNull();
  });
});

describe("guest review input", () => {
  it("accepts a guest name with an optional email", () => {
    expect(guestSchema.safeParse({ ...good, guestName: "Sarah Miller" }).success).toBe(true);
    const r = guestSchema.safeParse({ ...good, guestName: "Sarah Miller", guestEmail: " Sarah@Example.com " });
    expect(r.success && r.data.guestEmail).toBe("sarah@example.com");
  });
  it("treats a blank email as absent and rejects an invalid one", () => {
    const blank = guestSchema.safeParse({ ...good, guestName: "Sarah", guestEmail: "" });
    expect(blank.success && blank.data.guestEmail).toBeUndefined();
    expect(guestSchema.safeParse({ ...good, guestName: "Sarah", guestEmail: "not-an-email" }).success).toBe(false);
  });
  it("enforces 2–60 character names and rejects links or digits in names", () => {
    expect(guestSchema.safeParse({ ...good, guestName: "S" }).success).toBe(false);
    expect(guestSchema.safeParse({ ...good, guestName: "x".repeat(61) }).success).toBe(false);
    expect(guestSchema.safeParse({ ...good, guestName: "http://spam.example" }).success).toBe(false);
    expect(guestSchema.safeParse({ ...good, guestName: "Buy 4 Less" }).success).toBe(false);
  });
  it("still parses signed-in payloads without guest fields", () => {
    expect(guestSchema.safeParse(good).success).toBe(true);
  });
});

describe("review author display", () => {
  const base = {
    id: "r1", camp_id: "c1", attendee_role: "parent", attended_year: 2026, rating_value: 4, rating_instruction: 4, rating_exposure: 4,
    rating_organization: 4, rating_overall: 4, title: "Solid camp", body: "x".repeat(50), would_recommend: true, verification: "unverified",
    created_at: "2026-10-01T00:00:00.000Z",
  };
  it("labels guests and shows their short name", () => {
    const r = mapReviewRow({ ...base, is_guest: true, guest_name: "Sarah Miller", display_name: "Sarah M." });
    expect(r.isGuest).toBe(true);
    expect(r.authorName).toBe("Sarah M.");
  });
  it("labels members and uses their profile display name only", () => {
    const r = mapReviewRow({ ...base, is_guest: false, guest_name: null, display_name: "Coach Dave Ruiz" });
    expect(r.isGuest).toBe(false);
    expect(r.authorName).toBe("Coach R.");
    expect(mapReviewRow({ ...base, is_guest: false, display_name: null }).authorName).toBeNull();
  });
});

describe("camp submissions", () => {
  it("only known sports are accepted", () => {
    expect(isSportId("baseball")).toBe(true);
    expect(isSportId("quidditch")).toBe(false);
  });
  it("a submission matching an existing camp becomes an update (never a new duplicate camp)", () => {
    const existing = [{ id: "camp-1", name: "Texas Tech Baseball Prospect Camp", sport: "baseball", startDate: "2027-01-10", city: "Lubbock", state: "TX", institution: null }];
    const { items } = prepareQueueItems([{
      name: "Texas Tech Baseball Prospect Camp", sport: "baseball", startDate: "2027-01-10", sourceUrl: "https://example.edu/camp",
      city: "Lubbock", state: "TX",
    }], { sourceId: null, runId: null, fallbackUrl: null, existing, pendingFingerprints: new Set() });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("camp_update");
    expect(items[0].matchedCampId).toBe("camp-1");
  });
});
