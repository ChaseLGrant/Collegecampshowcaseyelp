import type { EditorialRating } from "./types";

/** Short explainer shown as a label/tooltip wherever the editorial rating appears. */
export const EDITORIAL_EXPLAINER =
  "Our team's rating based on college exposure, coaching, value and reputation — separate from parent reviews.";

export const EDITORIAL_LABEL = "Camp Check Editor Rating";

/** Valid editorial score: 1.0–5.0, rounded to one decimal (matches numeric(2,1) in the DB). */
export function normalizeEditorialScore(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  return r >= 1 && r <= 5 ? r : null;
}

export function hasEditorialRating(e: EditorialRating | null | undefined): e is EditorialRating & { score: number } {
  return !!e && typeof e.score === "number" && Number.isFinite(e.score);
}

/** "Camp Check Editor Rating ★ 4.6" */
export function editorialRatingText(score: number): string {
  return `${EDITORIAL_LABEL} ★ ${score.toFixed(1)}`;
}
