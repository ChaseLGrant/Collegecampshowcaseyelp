import { z } from "zod";
import { formatPrice } from "../format";
import { rankingScore } from "../ratings";
import { SPORT_IDS, type SportId } from "../sports";
import { approxMilesBetweenStates, normalizeState } from "../states";
import type { CampDetail } from "../types";

export const LEVELS = ["NCAA D1", "NCAA D2", "NCAA D3", "NAIA", "JUCO", "Any"] as const;

export const matchProfileSchema = z.object({
  sport: z.enum(SPORT_IDS as [SportId, ...SportId[]]),
  position: z.string().trim().max(40).optional().transform((v) => v || undefined),
  gradYear: z.coerce.number().int().min(2025).max(2040).optional(),
  homeState: z.string().transform((v) => normalizeState(v) ?? undefined).optional(),
  preferredLevels: z.array(z.enum(LEVELS)).default([]),
  gpa: z.coerce.number().min(0).max(5).optional(),
  maxTravelMiles: z.coerce.number().int().min(0).max(5000).optional(),
  budgetDollars: z.coerce.number().min(0).max(100000).optional(),
});
export type MatchProfile = z.infer<typeof matchProfileSchema>;

export interface MatchResult {
  camp: CampDetail;
  score: number; // 0..100
  reasons: string[];
  cautions: string[];
}

export const MATCH_DISCLAIMER =
  "Recommendations are based on the details you entered and verified listing data. No camp guarantees recruiting exposure, scholarship offers or roster placement.";

function levelOf(c: CampDetail): string | null {
  if (!c.classificationVerified || !c.association) return null;
  if (c.association === "NCAA" && c.division) return `NCAA ${c.division.replace(/^DI{1,3}$/, (d) => `D${d.length - 1}`)}`;
  if (c.association === "NJCAA" || c.association === "CCCAA" || c.association === "NWAC") return "JUCO";
  return c.association;
}

function gradYearsFrom(text: string | null): number[] {
  if (!text) return [];
  const years = [...text.matchAll(/\b(20[2-4]\d)\b/g)].map((m) => Number(m[1]));
  if (years.length === 2 && /[–-]/.test(text)) {
    const [a, b] = years.sort();
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return years;
}

/** Scores one camp for one athlete. Hard filters return null (camp excluded). */
export function scoreCamp(c: CampDetail, p: MatchProfile, now = new Date()): MatchResult | null {
  if (c.sport !== p.sport) return null;
  if (c.status !== "published") return null;
  const today = now.toISOString().slice(0, 10);
  if (c.startDate && c.startDate < today) return null;

  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 40;

  // Distance (rough, state-to-state)
  if (p.homeState && c.state) {
    const miles = approxMilesBetweenStates(p.homeState, c.state);
    if (miles != null) {
      if (p.maxTravelMiles != null && miles > p.maxTravelMiles) return null;
      if (miles === 0) { score += 15; reasons.push(`In your home state (${c.state})`); }
      else if (miles < 300) { score += 10; reasons.push(`Roughly ${miles} miles away (state-to-state estimate)`); }
      else if (miles < 800) { score += 4; reasons.push(`Roughly ${miles} miles away — plan for travel`); }
      else cautions.push(`Roughly ${miles} miles away — significant travel cost`);
    }
  } else if (!c.state) cautions.push("Location not listed");

  // Budget
  if (p.budgetDollars != null) {
    if (c.priceCents == null) cautions.push("Price not published — confirm it fits your budget");
    else if (c.priceCents > p.budgetDollars * 100) return null;
    else { score += 10; reasons.push(`${formatPrice(c.priceCents)} is within your ${formatPrice(p.budgetDollars * 100)} budget`); }
  }

  // Level preference — only verified classifications count.
  const lvl = levelOf(c);
  const wanted: string[] = p.preferredLevels.filter((l) => l !== "Any");
  if (wanted.length) {
    if (lvl && wanted.includes(lvl)) { score += 15; reasons.push(`Hosted by a ${lvl} program you're targeting`); }
    else if (!lvl && !c.institutionName) cautions.push("Independent showcase — attending college levels not verified");
    else if (!lvl) cautions.push("Host program level not verified");
    else score -= 5;
  }

  // Grad year eligibility (only if the listing states it)
  if (p.gradYear) {
    const years = gradYearsFrom(c.eligibility);
    if (years.length) {
      if (years.includes(p.gradYear)) { score += 8; reasons.push(`Open to the class of ${p.gradYear} (as advertised)`); }
      else return null;
    }
  }

  // Position
  if (p.position && c.positions.length) {
    const pos = p.position.toLowerCase();
    if (c.positions.some((x) => x.toLowerCase() === pos)) { score += 5; reasons.push(`Lists ${p.position} as a featured position`); }
  }

  // Verified college attendance
  const verified = c.participatingColleges.filter((x) => x.verified).length;
  if (verified) { score += Math.min(10, verified * 2); reasons.push(`${verified} verified participating college${verified > 1 ? "s" : ""}`); }
  else if (c.participatingColleges.length) cautions.push("Attending colleges are advertised but not verified");

  // Timing
  if (c.startDate) {
    const days = (new Date(c.startDate).getTime() - now.getTime()) / 86400000;
    if (days < 10) cautions.push("Starts very soon — registration may be closing");
    else if (days < 120) { score += 4; reasons.push("Coming up in the next few months"); }
  } else cautions.push("Dates not announced");

  // Community feedback (adjusted so few reviews don't dominate)
  const rs = rankingScore(c.stats);
  if (rs >= 0) {
    score += Math.round((rs - 3) * 6);
    reasons.push(`${c.stats.reviewCount} community review${c.stats.reviewCount > 1 ? "s" : ""} (avg ${c.stats.avgOverall?.toFixed(1)})`);
  } else cautions.push("No community reviews yet");

  if (c.verificationStatus !== "verified") cautions.push("Listing details not recently verified");

  return { camp: c, score: Math.max(0, Math.min(100, score)), reasons, cautions };
}

export function matchCamps(camps: CampDetail[], p: MatchProfile, limit = 20, now = new Date()): MatchResult[] {
  return camps
    .map((c) => scoreCamp(c, p, now))
    .filter((r): r is MatchResult => !!r)
    .sort((a, b) => b.score - a.score || (a.camp.startDate ?? "").localeCompare(b.camp.startDate ?? ""))
    .slice(0, limit);
}
