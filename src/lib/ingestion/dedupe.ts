import type { NormalizedCandidate } from "./types";

const STOP = new Set(["the", "a", "an", "of", "and", "at", "camp", "camps", "2024", "2025", "2026", "2027", "2028", "college", "university"]);

export function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}

/** Stable fingerprint: same event from two sources → same value. */
export function candidateFingerprint(c: Pick<NormalizedCandidate, "name" | "sport" | "startDate" | "state">): string {
  return [nameTokens(c.name).sort().join("-"), c.sport, c.startDate ?? "nodate", c.state ?? "nostate"].join("|");
}

export interface ExistingCampRef {
  id: string;
  name: string;
  sport: string;
  startDate: string | null;
  city: string | null;
  state: string | null;
  institution: string | null;
}

/** Scores how likely the candidate is the same event as an existing camp (0..1). */
export function duplicateScore(c: NormalizedCandidate, e: ExistingCampRef): number {
  if (c.sport !== e.sport) return 0;
  let score = jaccard(nameTokens(c.name), nameTokens(e.name)) * 0.55;
  if (c.startDate && e.startDate) score += c.startDate === e.startDate ? 0.25 : -0.15;
  if (c.state && e.state) score += c.state === e.state ? 0.08 : -0.2;
  if (c.city && e.city && c.city.toLowerCase() === e.city.toLowerCase()) score += 0.07;
  if (c.institution && e.institution && c.institution.toLowerCase() === e.institution.toLowerCase()) score += 0.05;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export const DUPLICATE_THRESHOLD = 0.7;

export function findBestMatch(c: NormalizedCandidate, existing: ExistingCampRef[]) {
  let best: { camp: ExistingCampRef; score: number } | null = null;
  for (const e of existing) {
    const s = duplicateScore(c, e);
    if (!best || s > best.score) best = { camp: e, score: s };
  }
  return best && best.score >= 0.5 ? best : null;
}
