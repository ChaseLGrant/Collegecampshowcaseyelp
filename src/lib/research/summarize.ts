import type { CampDetail, ResearchFact } from "../types";
import { ratingDisplay } from "../ratings";
import { formatPrice } from "../format";

export interface DraftSummary {
  summary: string;
  considerations: string[];
  method: "template" | "ai_assisted";
  model: string | null;
}

/** Deterministic summary used when AI is not configured. Uses only the supplied facts. */
export function templateSummary(camp: CampDetail, facts: ResearchFact[]): DraftSummary {
  const rd = ratingDisplay(camp.stats);
  const considerations: string[] = [];
  if (camp.priceCents == null) considerations.push("The organizer has not published a price — confirm the total cost before registering.");
  else considerations.push(`Advertised cost is ${formatPrice(camp.priceCents)}; add travel and lodging to compare true cost.`);
  if (camp.participatingColleges.some((c) => !c.verified)) considerations.push("Some listed college attendance is advertised by the organizer and not independently verified.");
  if (camp.verificationStatus !== "verified") considerations.push("Details have not been recently verified; check the official registration page.");
  if (rd.kind === "none") considerations.push("There are no community reviews yet, so there is no first-hand feedback to weigh.");
  else if (rd.kind === "early") considerations.push("Only a few community reviews exist; treat the rating as an early signal.");
  if (facts.some((f) => f.kind === "external_source")) considerations.push("External sources are linked below — read them on the original site for full context.");
  considerations.push("No camp can guarantee recruiting exposure, offers or roster spots.");
  const summary =
    `${facts[0]?.text ?? camp.name} ${facts[1]?.text ?? ""} ` +
    (rd.kind === "none" ? "CampGrade has no community reviews for this event yet." : `Community feedback so far: ${rd.label}.`);
  return { summary: summary.replace(/\s+/g, " ").trim(), considerations, method: "template", model: null };
}

/** Validates AI output: every sentence group must cite known fact IDs; uncited claims are dropped. */
export function validateAiOutput(raw: unknown, facts: ResearchFact[]): { summary: string; considerations: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { summary?: unknown; considerations?: unknown };
  if (typeof o.summary !== "string" || !Array.isArray(o.considerations)) return null;
  const ids = new Set(facts.map((f) => f.id));
  const cited = (s: string) => {
    const refs = [...s.matchAll(/\[(F\d+)\]/g)].map((m) => m[1]);
    return refs.length > 0 && refs.every((r) => ids.has(r));
  };
  const sentences = o.summary.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.trim());
  const keptSummary = sentences.filter(cited);
  if (!keptSummary.length) return null;
  const banned = /\bguarantee[sd]?\b.*\b(offer|scholarship|roster|recruit)/i;
  const considerations = (o.considerations as unknown[])
    .filter((c): c is string => typeof c === "string")
    .filter((c) => !banned.test(c))
    .slice(0, 6);
  return { summary: keptSummary.filter((s) => !banned.test(s)).join(" "), considerations };
}
