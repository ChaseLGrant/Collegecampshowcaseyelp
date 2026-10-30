import type { ExternalProvenance, PublicExternalReview } from "../types";

export type RightsStatus = "licensed" | "permitted" | "link_only" | "pending_review" | "prohibited";

export interface ExternalReviewRecord {
  id: string;
  platformName: string;
  sourceUrl: string;
  provenanceType: ExternalProvenance;
  referencedName: string;
  reviewDate: string | null;
  rating: number | null;
  ratingScale: number | null;
  ratingDisplayPermitted: boolean;
  excerpt: string | null;
  excerptPermitted: boolean;
  reviewerDisplay: string | null;
  reviewerDisplayPermitted: boolean;
  attribution: string;
  rightsStatus: RightsStatus;
  matchConfidence: number;
  status: "pending" | "approved" | "rejected";
  sentiment?: PublicExternalReview["sentiment"];
}

/** Our own summaries are stored with attribution "Paraphrased from <platform>"; they are not quotes. */
export function isParaphraseAttribution(attribution: string | null | undefined): boolean {
  return /^paraphrased\b/i.test(String(attribution ?? "").trim());
}

/** Minimum confidence that an external record refers to this camp before it can be shown. */
export const MIN_DISPLAY_CONFIDENCE = 0.6;

/**
 * Applies content rights. Mirrors the external_reviews_public SQL view so the
 * same rules hold in code and in the database. Returns null if nothing may be shown.
 */
export function toPublicExternalReview(r: ExternalReviewRecord): PublicExternalReview | null {
  if (r.status !== "approved") return null;
  if (!["licensed", "permitted", "link_only"].includes(r.rightsStatus)) return null;
  if (r.matchConfidence < MIN_DISPLAY_CONFIDENCE) return null;
  const full = r.rightsStatus === "licensed" || r.rightsStatus === "permitted";
  return {
    id: r.id,
    platformName: r.platformName,
    sourceUrl: r.sourceUrl,
    provenanceType: r.provenanceType,
    referencedName: r.referencedName,
    reviewDate: r.reviewDate,
    rating: full && r.ratingDisplayPermitted ? r.rating : null,
    ratingScale: full && r.ratingDisplayPermitted ? r.ratingScale : null,
    excerpt: full && r.excerptPermitted ? r.excerpt : null,
    reviewerDisplay: full && r.reviewerDisplayPermitted ? r.reviewerDisplay : null,
    attribution: r.attribution,
    linkOnly: !full,
    paraphrased: isParaphraseAttribution(r.attribution),
    sentiment: r.sentiment ?? null,
    matchConfidence: r.matchConfidence,
  };
}

export function provenanceLabel(p: ExternalProvenance): string {
  switch (p) {
    case "licensed_dataset": return "Licensed review data";
    case "authorized_api": return "Authorized review source";
    case "public_page": return "Public review page";
    case "organizer_testimonial": return "Organizer-provided testimonial";
    case "editorial": return "Independent editorial evaluation";
  }
}

/** Default rights for a source's content_rights setting (admin can tighten per record). */
export function defaultRightsForSource(contentRights: string): { rightsStatus: RightsStatus; excerptPermitted: boolean; ratingDisplayPermitted: boolean } {
  switch (contentRights) {
    case "licensed_excerpt": return { rightsStatus: "licensed", excerptPermitted: true, ratingDisplayPermitted: true };
    case "licensed_display": return { rightsStatus: "licensed", excerptPermitted: false, ratingDisplayPermitted: true };
    case "link_only":
    case "facts_only": return { rightsStatus: "link_only", excerptPermitted: false, ratingDisplayPermitted: false };
    case "prohibited": return { rightsStatus: "prohibited", excerptPermitted: false, ratingDisplayPermitted: false };
    default: return { rightsStatus: "pending_review", excerptPermitted: false, ratingDisplayPermitted: false };
  }
}
