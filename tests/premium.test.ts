import { describe, expect, it } from "vitest";
import { buildComparison, tradeoffs } from "@/lib/compare/compare";
import { matchCamps, matchProfileSchema, scoreCamp } from "@/lib/matching/score";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import type { CampDetail } from "@/lib/types";

const camp = (over: Partial<CampDetail>): CampDetail => ({ ...SAMPLE_CAMPS[0], ...over });
const now = new Date();

describe("matching", () => {
  const profile = matchProfileSchema.parse({ sport: "baseball", homeState: "TX", budgetDollars: 250, gradYear: 2028, preferredLevels: ["NCAA D1"] });
  it("only returns the athlete's sport and explains each match", () => {
    const res = matchCamps(SAMPLE_CAMPS, profile, 20, now);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.camp.sport === "baseball")).toBe(true);
    expect(res[0].reasons.length).toBeGreaterThan(0);
  });
  it("excludes camps over budget, out of range, or for other grad years", () => {
    expect(scoreCamp(camp({ priceCents: 50000 }), profile, now)).toBeNull();
    expect(scoreCamp(camp({ state: "WA" }), { ...profile, maxTravelMiles: 300 }, now)).toBeNull();
    expect(scoreCamp(camp({ eligibility: "Grad years 2030–2031" }), profile, now)).toBeNull();
  });
  it("only credits verified school levels", () => {
    const verified = scoreCamp(camp({}), profile, now)!;
    const unverified = scoreCamp(camp({ classificationVerified: false }), profile, now)!;
    expect(verified.score).toBeGreaterThan(unverified.score);
    expect(unverified.cautions.join(" ")).toMatch(/not verified/);
  });
  it("never claims guaranteed outcomes", () => {
    const text = matchCamps(SAMPLE_CAMPS, profile, 20, now).flatMap((r) => [...r.reasons, ...r.cautions]).join(" ");
    expect(text).not.toMatch(/guarantee/i);
  });
});

describe("comparison", () => {
  const a = camp({ id: "a", name: "A", priceCents: 10000, participatingColleges: [{ name: "X", verified: true, sourceUrl: null }] });
  const b = camp({ id: "b", name: "B", priceCents: 30000, verificationStatus: "verified", participatingColleges: [{ name: "Y", verified: false, sourceUrl: null }] });
  it("labels every cell with its kind of information", () => {
    const { rows } = buildComparison([a, b], { advanced: false });
    const exposure = rows.find((r) => r.label === "Coaching exposure claims")!;
    expect(exposure.cells.map((c) => c.kind)).toEqual(["verified", "advertised"]);
    const rating = rows.find((r) => r.label === "Community rating")!;
    expect(rating.cells.every((c) => c.kind === "missing" && c.text === "No reviews yet")).toBe(true);
    expect(rows.find((r) => r.label === "Price")!.cells.map((c) => c.kind)).toEqual(["advertised", "verified"]);
  });
  it("hides research rows unless advanced", () => {
    expect(buildComparison([a, b], { advanced: false }).rows.some((r) => r.label === "Research summary")).toBe(false);
    expect(buildComparison([a, b], { advanced: true }).rows.some((r) => r.label === "Research summary")).toBe(true);
  });
  it("summarizes tradeoffs without promising recruiting outcomes", () => {
    const t = tradeoffs([a, b], "TX");
    expect(t[0]).toMatch(/A is the lowest advertised price, \$200 less than B/);
    expect(t.join(" ")).toMatch(/not guarantees/);
    expect(t.join(" ")).toMatch(/None of these camps has community reviews/);
  });
});
