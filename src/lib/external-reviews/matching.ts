import { jaccard, nameTokens } from "../ingestion/dedupe";

export interface ExternalRef {
  referencedName: string;
  organizer?: string | null;
  sport?: string | null;
  reviewDate?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface CampMatchTarget {
  id: string;
  name: string;
  sport: string;
  organizerName: string | null;
  institutionName: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null;
}

/** Confidence that an external review refers to this camp, with the reasons used. */
export function matchConfidence(ref: ExternalRef, camp: CampMatchTarget): { confidence: number; method: string } {
  const reasons: string[] = [];
  if (ref.sport && ref.sport.toLowerCase() !== camp.sport) return { confidence: 0, method: "sport mismatch" };
  const nameSim = Math.max(
    jaccard(nameTokens(ref.referencedName), nameTokens(camp.name)),
    camp.organizerName ? jaccard(nameTokens(ref.referencedName), nameTokens(camp.organizerName)) * 0.8 : 0,
    camp.institutionName ? jaccard(nameTokens(ref.referencedName), nameTokens(camp.institutionName)) * 0.7 : 0,
  );
  let score = nameSim * 0.7;
  reasons.push(`name ${Math.round(nameSim * 100)}%`);
  if (ref.organizer && camp.organizerName && ref.organizer.toLowerCase() === camp.organizerName.toLowerCase()) {
    score += 0.15; reasons.push("organizer match");
  }
  if (ref.state && camp.state) {
    if (ref.state.toUpperCase() === camp.state) { score += 0.08; reasons.push("state match"); }
    else { score -= 0.2; reasons.push("state mismatch"); }
  }
  if (ref.city && camp.city && ref.city.toLowerCase() === camp.city.toLowerCase()) { score += 0.05; reasons.push("city match"); }
  if (ref.sport) { score += 0.05; reasons.push("sport match"); }
  // A review dated well before an event cannot be about that specific edition; it may be about the organizer.
  if (ref.reviewDate && camp.startDate && ref.reviewDate < camp.startDate) reasons.push("review predates this edition (organizer-level)");
  return { confidence: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), method: reasons.join(", ") };
}

export function bestCampMatch(ref: ExternalRef, camps: CampMatchTarget[]) {
  let best: { camp: CampMatchTarget; confidence: number; method: string } | null = null;
  for (const c of camps) {
    const m = matchConfidence(ref, c);
    if (!best || m.confidence > best.confidence) best = { camp: c, ...m };
  }
  return best;
}
