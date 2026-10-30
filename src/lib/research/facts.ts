import { formatDateRange, formatPrice, locationLabel } from "../format";
import { RATING_CATEGORIES, ratingDisplay } from "../ratings";
import { eventTypeLabel, sportLabel } from "../sports";
import type { CampDetail, PublicExternalReview, ResearchFact } from "../types";

/**
 * Builds the only facts a research summary may use. Each fact is typed so
 * readers can tell verified facts, advertised claims, community opinion and
 * external sources apart.
 */
export function buildResearchFacts(camp: CampDetail, external: PublicExternalReview[]): ResearchFact[] {
  const facts: ResearchFact[] = [];
  const src = camp.sourceUrl;
  const factKind = camp.verificationStatus === "verified" ? "verified_fact" : "advertised_claim";
  let n = 0;
  const add = (kind: ResearchFact["kind"], text: string, sourceUrl: string | null) =>
    facts.push({ id: `F${++n}`, kind, text, sourceUrl });

  add(factKind, `${camp.name} is a ${sportLabel(camp.sport).toLowerCase()} ${eventTypeLabel(camp.eventType).toLowerCase()}${camp.institutionName ? ` hosted by ${camp.institutionName}` : ""}${camp.organizerName ? `, organized by ${camp.organizerName}` : ""}.`, src);
  add(factKind, `Location: ${locationLabel(camp.city, camp.state)}. Dates: ${formatDateRange(camp.startDate, camp.endDate)}.`, src);
  add(factKind, `Advertised price: ${formatPrice(camp.priceCents, camp.priceNotes)}.`, src);
  if (camp.eligibility) add("advertised_claim", `Eligibility as advertised: ${camp.eligibility}.`, src);
  if (camp.association && camp.classificationVerified) {
    add("verified_fact", `Host program classification: ${camp.association}${camp.division ? ` ${camp.division}` : ""}.`, null);
  }
  const verifiedColleges = camp.participatingColleges.filter((c) => c.verified);
  const claimedColleges = camp.participatingColleges.filter((c) => !c.verified);
  if (verifiedColleges.length) add("verified_fact", `Verified participating colleges: ${verifiedColleges.map((c) => c.name).join(", ")}.`, verifiedColleges[0].sourceUrl);
  if (claimedColleges.length) add("advertised_claim", `Colleges the organizer says will attend (not independently verified): ${claimedColleges.map((c) => c.name).join(", ")}.`, src);
  if (camp.lastVerifiedAt) add("verified_fact", `Listing last verified against its source on ${camp.lastVerifiedAt.slice(0, 10)}.`, src);
  else add("advertised_claim", "This listing has not yet been verified against an official source.", src);

  const rd = ratingDisplay(camp.stats);
  if (rd.kind === "none") add("community_opinion", "No Camp Check community reviews yet.", null);
  else {
    add("community_opinion", `Camp Check community rating: ${rd.label} (${camp.stats.verifiedCount} with verified attendance).`, null);
    const s = camp.stats;
    const byCat: Record<string, number | null> = { value: s.avgValue, instruction: s.avgInstruction, exposure: s.avgExposure, organization: s.avgOrganization, overall: s.avgOverall };
    const parts = RATING_CATEGORIES.map((c) => (byCat[c.key] != null ? `${c.label} ${byCat[c.key]!.toFixed(1)}` : null)).filter(Boolean);
    if (parts.length) add("community_opinion", `Community category averages: ${parts.join("; ")}.`, null);
  }
  for (const e of external.slice(0, 8)) {
    const rating = e.rating != null && e.ratingScale ? ` rated ${e.rating}/${e.ratingScale}` : "";
    const ex = e.excerpt ? ` Excerpt: "${e.excerpt}"` : "";
    add("external_source", `${e.platformName}${rating} (${e.attribution}).${ex}`, e.sourceUrl);
  }
  return facts;
}
