import type { RatingStats } from "./types";

/** Minimum published reviews before a camp's rating is shown as an established score. */
export const MIN_REVIEWS_FOR_ESTABLISHED = 3;

/** Prior used to keep camps with very few reviews from outranking well-reviewed camps. */
const PRIOR_MEAN = 3.0;
const PRIOR_WEIGHT = 5;

export const RATING_CATEGORIES = [
  { key: "value", label: "Value for Money" },
  { key: "instruction", label: "Quality of Instruction" },
  { key: "exposure", label: "College Coach Exposure" },
  { key: "organization", label: "Event Organization" },
  { key: "overall", label: "Overall Experience" },
] as const;
export type RatingKey = (typeof RATING_CATEGORIES)[number]["key"];

export type RatingDisplay =
  | { kind: "none"; label: string }
  | { kind: "early"; value: number; count: number; label: string }
  | { kind: "established"; value: number; count: number; label: string };

/**
 * How a camp's community rating should be presented. An unreviewed camp is never
 * shown with stars; camps with only one or two reviews are labeled "early".
 */
export function ratingDisplay(stats: RatingStats | null | undefined): RatingDisplay {
  if (!stats || stats.reviewCount <= 0 || stats.avgOverall == null) {
    return { kind: "none", label: "No reviews yet" };
  }
  const value = Math.round(stats.avgOverall * 10) / 10;
  const n = stats.reviewCount;
  const noun = n === 1 ? "review" : "reviews";
  if (n < MIN_REVIEWS_FOR_ESTABLISHED) {
    return { kind: "early", value, count: n, label: `${value.toFixed(1)} · early rating from ${n} ${noun}` };
  }
  return { kind: "established", value, count: n, label: `${value.toFixed(1)} from ${n} ${noun}` };
}

/** Bayesian-adjusted score used only for sorting. Unreviewed camps sort last. */
export function rankingScore(stats: RatingStats | null | undefined): number {
  if (!stats || stats.reviewCount <= 0 || stats.avgOverall == null) return -1;
  const n = stats.reviewCount;
  return (PRIOR_WEIGHT * PRIOR_MEAN + n * stats.avgOverall) / (PRIOR_WEIGHT + n);
}

export function emptyStats(): RatingStats {
  return {
    reviewCount: 0, verifiedCount: 0, avgOverall: null, avgValue: null,
    avgInstruction: null, avgExposure: null, avgOrganization: null,
  };
}

export function computeStats(
  reviews: { ratings: Record<RatingKey, number>; verified: boolean }[],
): RatingStats {
  if (reviews.length === 0) return emptyStats();
  const avg = (k: RatingKey) =>
    Math.round((reviews.reduce((s, r) => s + r.ratings[k], 0) / reviews.length) * 100) / 100;
  return {
    reviewCount: reviews.length,
    verifiedCount: reviews.filter((r) => r.verified).length,
    avgOverall: avg("overall"),
    avgValue: avg("value"),
    avgInstruction: avg("instruction"),
    avgExposure: avg("exposure"),
    avgOrganization: avg("organization"),
  };
}
