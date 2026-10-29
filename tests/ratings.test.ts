import { describe, expect, it } from "vitest";
import { computeStats, emptyStats, rankingScore, ratingDisplay } from "@/lib/ratings";

const stats = (n: number, avg: number) => ({ ...emptyStats(), reviewCount: n, avgOverall: avg });

describe("ratingDisplay", () => {
  it("never shows a rating for unreviewed camps", () => {
    expect(ratingDisplay(emptyStats()).kind).toBe("none");
    expect(ratingDisplay(null).label).toBe("No reviews yet");
  });
  it("labels camps with few reviews as early", () => {
    expect(ratingDisplay(stats(1, 5)).kind).toBe("early");
    expect(ratingDisplay(stats(3, 4.2)).kind).toBe("established");
  });
});

describe("rankingScore", () => {
  it("sorts unreviewed camps last", () => {
    expect(rankingScore(emptyStats())).toBeLessThan(rankingScore(stats(1, 1)));
  });
  it("keeps a single 5-star review below a well-reviewed 4.6", () => {
    expect(rankingScore(stats(1, 5))).toBeLessThan(rankingScore(stats(40, 4.6)));
  });
});

describe("computeStats", () => {
  it("averages each category", () => {
    const r = (o: number) => ({ ratings: { value: o, instruction: o, exposure: o, organization: o, overall: o }, verified: o > 3 });
    const s = computeStats([r(5), r(3)]);
    expect(s.avgOverall).toBe(4);
    expect(s.verifiedCount).toBe(1);
  });
});
