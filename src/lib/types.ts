import type { EventType, SportId } from "./sports";

export type VerificationStatus = "verified" | "unverified" | "stale";

export interface RatingStats {
  reviewCount: number;
  verifiedCount: number;
  avgOverall: number | null;
  avgValue: number | null;
  avgInstruction: number | null;
  avgExposure: number | null;
  avgOrganization: number | null;
}

/** CampGrade editorial (staff) rating — independent of community/parent reviews. */
export interface EditorialRating {
  score: number | null; // 1.0–5.0, one decimal
  pick: boolean;
  rationale: string | null;
}

export interface CampSummary {
  id: string;
  slug: string;
  name: string;
  sport: SportId;
  sportDetail: string | null;
  eventType: EventType;
  institutionName: string | null;
  institutionSlug: string | null;
  association: string | null;
  division: string | null;
  classificationVerified: boolean;
  organizerName: string | null;
  city: string | null;
  state: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  priceCents: number | null;
  priceNotes: string | null;
  registrationUrl: string | null;
  status: "published" | "cancelled" | "draft" | "archived";
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  sourceUrl: string | null;
  stats: RatingStats;
  /** CampGrade's own staff rating. Kept separate from parent reviews; never blended into `stats`. */
  editorial: EditorialRating;
  /** True only for clearly-labeled sample data used when no database is configured. */
  isSample?: boolean;
}

export interface CampDetail extends CampSummary {
  venue: string | null;
  description: string | null;
  eligibility: string | null;
  positions: string[];
  participatingColleges: { name: string; verified: boolean; sourceUrl: string | null }[];
  coaches: { name: string; title: string | null; verified: boolean; sourceUrl: string | null }[];
}

export interface CommunityReview {
  id: string;
  campId: string;
  attendeeRole: "parent" | "athlete" | "coach" | "other";
  attendedYear: number | null;
  ratings: { value: number; instruction: number; exposure: number; organization: number; overall: number };
  title: string;
  body: string;
  wouldRecommend: boolean | null;
  verified: boolean;
  createdAt: string;
  /** Public short name ("Sarah M.") — profile display name for members, the given name for guests. */
  authorName?: string | null;
  /** True when posted without an account. */
  isGuest?: boolean;
}

export type ExternalProvenance =
  | "licensed_dataset"
  | "authorized_api"
  | "public_page"
  | "organizer_testimonial"
  | "editorial";

/** External review as it may be shown publicly (non-permitted fields already removed). */
export interface PublicExternalReview {
  id: string;
  platformName: string;
  sourceUrl: string;
  provenanceType: ExternalProvenance;
  referencedName: string;
  reviewDate: string | null;
  rating: number | null;
  ratingScale: number | null;
  excerpt: string | null;
  reviewerDisplay: string | null;
  attribution: string;
  linkOnly: boolean;
  /** True when the excerpt is CampGrade's own paraphrase (attribution "Paraphrased from …"), not a quote. */
  paraphrased: boolean;
  sentiment: "positive" | "mixed" | "negative" | "neutral" | null;
  matchConfidence: number;
}

export interface ResearchFact {
  id: string;
  kind: "verified_fact" | "advertised_claim" | "community_opinion" | "external_source";
  text: string;
  sourceUrl: string | null;
}

export interface ResearchSummary {
  id: string;
  campId: string;
  summary: string;
  considerations: string[];
  facts: ResearchFact[];
  method: "template" | "ai_assisted";
  generatedAt: string;
  accessTier: "free" | "insider" | "elite";
}
