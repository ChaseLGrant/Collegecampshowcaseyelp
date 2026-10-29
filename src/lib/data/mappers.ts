import type { CampDetail, CampSummary, CommunityReview, PublicExternalReview, ResearchSummary } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => (v == null ? null : Number(v));

export function mapDirectoryRow(r: any): CampSummary {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    sport: r.sport,
    sportDetail: r.sport_detail ?? null,
    eventType: r.event_type,
    institutionName: r.institution_name ?? null,
    institutionSlug: r.institution_slug ?? null,
    association: r.association ?? null,
    division: r.division ?? null,
    classificationVerified: Boolean(r.classification_verified),
    organizerName: r.organizer_name ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    priceCents: r.price_cents ?? null,
    priceNotes: r.price_notes ?? null,
    registrationUrl: r.registration_url ?? null,
    status: r.status,
    verificationStatus: r.verification_status,
    lastVerifiedAt: r.last_verified_at ?? null,
    sourceUrl: r.source_url ?? null,
    stats: {
      reviewCount: Number(r.review_count ?? 0),
      verifiedCount: Number(r.verified_review_count ?? 0),
      avgOverall: num(r.avg_overall),
      avgValue: num(r.avg_value),
      avgInstruction: num(r.avg_instruction),
      avgExposure: num(r.avg_exposure),
      avgOrganization: num(r.avg_organization),
    },
  };
}

export function mapDetailRow(r: any, colleges: any[] = [], coaches: any[] = []): CampDetail {
  return {
    ...mapDirectoryRow(r),
    venue: r.venue ?? null,
    description: r.description ?? null,
    eligibility: r.eligibility ?? null,
    positions: r.positions ?? [],
    participatingColleges: colleges.map((c) => ({
      name: c.institutions?.name ?? "Unknown", verified: Boolean(c.verified), sourceUrl: c.source_url ?? null,
    })),
    coaches: coaches.map((c) => ({
      name: c.coach_name, title: c.title ?? null, verified: Boolean(c.verified), sourceUrl: c.source_url ?? null,
    })),
  };
}

export function mapReviewRow(r: any): CommunityReview {
  return {
    id: r.id,
    campId: r.camp_id,
    attendeeRole: r.attendee_role,
    attendedYear: r.attended_year ?? null,
    ratings: {
      value: r.rating_value, instruction: r.rating_instruction, exposure: r.rating_exposure,
      organization: r.rating_organization, overall: r.rating_overall,
    },
    title: r.title,
    body: r.body,
    wouldRecommend: r.would_recommend ?? null,
    verified: r.verification === "verified",
    createdAt: r.created_at,
  };
}

export function mapExternalPublicRow(r: any): PublicExternalReview {
  return {
    id: r.id,
    platformName: r.platform_name,
    sourceUrl: r.source_url,
    provenanceType: r.provenance_type,
    referencedName: r.referenced_name,
    reviewDate: r.review_date ?? null,
    rating: num(r.rating),
    ratingScale: num(r.rating_scale),
    excerpt: r.excerpt ?? null,
    reviewerDisplay: r.reviewer_display ?? null,
    attribution: r.attribution,
    linkOnly: r.rights_status === "link_only",
    matchConfidence: Number(r.match_confidence ?? 0),
  };
}

export function mapResearchRow(r: any): ResearchSummary {
  return {
    id: r.id,
    campId: r.camp_id,
    summary: r.summary,
    considerations: Array.isArray(r.considerations) ? r.considerations : [],
    facts: Array.isArray(r.facts) ? r.facts : [],
    method: r.method,
    generatedAt: r.generated_at,
    accessTier: r.access_tier,
  };
}
