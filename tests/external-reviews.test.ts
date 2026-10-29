import { describe, expect, it } from "vitest";
import { defaultRightsForSource, toPublicExternalReview, type ExternalReviewRecord } from "@/lib/external-reviews/rights";
import { matchConfidence } from "@/lib/external-reviews/matching";
import { parseExternalReviewCsv } from "@/lib/external-reviews/csv-import";

const rec = (over: Partial<ExternalReviewRecord> = {}): ExternalReviewRecord => ({
  id: "e1", platformName: "ReviewSite", sourceUrl: "https://reviews.example.com/1", provenanceType: "licensed_dataset",
  referencedName: "Sample Camp", reviewDate: "2026-05-01", rating: 4, ratingScale: 5, ratingDisplayPermitted: true,
  excerpt: "Great coaching.", excerptPermitted: true, reviewerDisplay: "J. Doe", reviewerDisplayPermitted: false,
  attribution: "© ReviewSite, used under license", rightsStatus: "licensed", matchConfidence: 0.9, status: "approved", ...over,
});

describe("external review rights", () => {
  it("shows licensed content but never unpermitted reviewer identities", () => {
    const p = toPublicExternalReview(rec())!;
    expect(p.rating).toBe(4);
    expect(p.excerpt).toBe("Great coaching.");
    expect(p.reviewerDisplay).toBeNull();
    expect(p.linkOnly).toBe(false);
  });
  it("link-only sources expose only attribution and the link", () => {
    const p = toPublicExternalReview(rec({ rightsStatus: "link_only" }))!;
    expect(p.rating).toBeNull();
    expect(p.excerpt).toBeNull();
    expect(p.linkOnly).toBe(true);
    expect(p.sourceUrl).toContain("https://");
    expect(p.attribution).toBeTruthy();
  });
  it("hides unapproved, unreviewed, prohibited or low-confidence records", () => {
    expect(toPublicExternalReview(rec({ status: "pending" }))).toBeNull();
    expect(toPublicExternalReview(rec({ rightsStatus: "pending_review" }))).toBeNull();
    expect(toPublicExternalReview(rec({ rightsStatus: "prohibited" }))).toBeNull();
    expect(toPublicExternalReview(rec({ matchConfidence: 0.4 }))).toBeNull();
  });
  it("respects per-field permissions even when licensed", () => {
    const p = toPublicExternalReview(rec({ excerptPermitted: false, ratingDisplayPermitted: false }))!;
    expect(p.excerpt).toBeNull();
    expect(p.rating).toBeNull();
  });
  it("derives conservative defaults from source rights", () => {
    expect(defaultRightsForSource("unknown").rightsStatus).toBe("pending_review");
    expect(defaultRightsForSource("facts_only")).toEqual({ rightsStatus: "link_only", excerptPermitted: false, ratingDisplayPermitted: false });
    expect(defaultRightsForSource("licensed_excerpt").excerptPermitted).toBe(true);
  });
});

describe("matching external records to camps", () => {
  const camp = { id: "c1", name: "Sample State Baseball Prospect Camp", sport: "baseball", organizerName: "Sample State Athletics", institutionName: "Sample State University", city: "Austin", state: "TX", startDate: "2026-06-01" };
  it("is confident on strong matches", () => {
    expect(matchConfidence({ referencedName: "Sample State Baseball Prospect Camp", sport: "baseball", state: "TX", city: "Austin" }, camp).confidence).toBeGreaterThan(0.8);
  });
  it("rejects sport mismatches and penalizes state mismatches", () => {
    expect(matchConfidence({ referencedName: camp.name, sport: "softball" }, camp).confidence).toBe(0);
    expect(matchConfidence({ referencedName: camp.name, state: "CA" }, camp).confidence).toBeLessThan(0.6);
  });
});

describe("external review CSV", () => {
  it("requires attribution and valid URLs", () => {
    expect(parseExternalReviewCsv("platform_name,source_url,referenced_name\nX,https://x.com,Camp").errors.length).toBeGreaterThan(0);
    const { rows, errors } = parseExternalReviewCsv("platform_name,source_url,referenced_name,attribution,rating\nX,javascript:alert(1),Camp,X Inc,4\nX,https://x.com/r,Camp,X Inc,9");
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });
});
