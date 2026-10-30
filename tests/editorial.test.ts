import { describe, expect, it } from "vitest";
import { filtersToQuery, parseSearchFilters } from "@/lib/search";
import { filterAndSortCamps } from "@/lib/data/filter";
import { mapDirectoryRow, mapExternalPublicRow } from "@/lib/data/mappers";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import { editorialRatingText, normalizeEditorialScore, EDITORIAL_EXPLAINER } from "@/lib/editorial";
import { toPublicExternalReview, type ExternalReviewRecord } from "@/lib/external-reviews/rights";
import type { CampSummary } from "@/lib/types";

const withEd = (i: number, score: number | null, pick = false, extra: Partial<CampSummary> = {}): CampSummary => ({
  ...SAMPLE_CAMPS[i], editorial: { score, pick, rationale: null }, ...extra,
});

describe("default sort", () => {
  it("is 'recommended' when no sort is chosen and there's no keyword", () => {
    expect(parseSearchFilters({}).sort).toBe("recommended");
    expect(parseSearchFilters({ q: "texas" }).sort).toBe("relevance");
    expect(parseSearchFilters({ sort: "date" }).sort).toBe("date");
    expect(parseSearchFilters({ sort: "editorial" }).sort).toBe("editorial");
  });
  it("omits only the default sort from URLs, so explicit choices round-trip", () => {
    expect(filtersToQuery(parseSearchFilters({ sport: "baseball" }))).toBe("sport=baseball");
    expect(filtersToQuery(parseSearchFilters({ sport: "baseball", sort: "date" }))).toBe("sport=baseball&sort=date");
    expect(parseSearchFilters(new URLSearchParams(filtersToQuery(parseSearchFilters({ sort: "date" })))).sort).toBe("date");
  });
  it("orders picks first, then editor score (unscored last), then community ranking, then date", () => {
    const camps = [withEd(0, null), withEd(1, 4.9), withEd(2, 4.2, true), withEd(3, 4.8, true), withEd(4, 3.1)];
    const ids = filterAndSortCamps(camps, parseSearchFilters({ includePast: "1" })).items.map((c) => c.id);
    expect(ids).toEqual([camps[3].id, camps[2].id, camps[1].id, camps[4].id, camps[0].id]);
  });
  it("'Top rated by Camp Check' orders by editor score first", () => {
    const camps = [withEd(0, 4.1, true), withEd(1, 4.9), withEd(2, null, true)];
    const ids = filterAndSortCamps(camps, parseSearchFilters({ sort: "editorial", includePast: "1" })).items.map((c) => c.id);
    expect(ids).toEqual([camps[1].id, camps[0].id, camps[2].id]);
  });
  it("editorsPick filter keeps only picks", () => {
    const camps = [withEd(0, 4.1, true), withEd(1, 4.9)];
    const r = filterAndSortCamps(camps, parseSearchFilters({ editorsPick: "1", includePast: "1" }));
    expect(r.items.map((c) => c.id)).toEqual([camps[0].id]);
  });
});

describe("editorial rating is separate from parent reviews", () => {
  it("maps editorial fields without touching review stats", () => {
    const c = mapDirectoryRow({ id: "x", slug: "x", name: "X", sport: "baseball", event_type: "id_camp", status: "published",
      verification_status: "verified", review_count: 0, avg_overall: null, editorial_score: "4.6", editorial_pick: true, editorial_rationale: "Strong D1 staff." });
    expect(c.editorial).toEqual({ score: 4.6, pick: true, rationale: "Strong D1 staff." });
    expect(c.stats.reviewCount).toBe(0);
    expect(c.stats.avgOverall).toBeNull();
  });
  it("formats the label and validates scores", () => {
    expect(editorialRatingText(4.6)).toBe("Camp Check Editor Rating ★ 4.6");
    expect(EDITORIAL_EXPLAINER).toMatch(/separate from parent reviews/);
    expect(normalizeEditorialScore("4.64")).toBe(4.6);
    expect(normalizeEditorialScore(0.5)).toBeNull();
    expect(normalizeEditorialScore(5.2)).toBeNull();
    expect(normalizeEditorialScore("")).toBeNull();
  });
});

describe("paraphrased external feedback", () => {
  const rec = (o: Partial<ExternalReviewRecord> = {}): ExternalReviewRecord => ({
    id: "1", platformName: "Reddit", sourceUrl: "https://reddit.com/r/x", provenanceType: "public_page", referencedName: "X",
    reviewDate: "2026-05-01", rating: 4.5, ratingScale: 5, ratingDisplayPermitted: false, excerpt: "Parents liked the coaching.",
    excerptPermitted: true, reviewerDisplay: null, reviewerDisplayPermitted: false, attribution: "Paraphrased from Reddit",
    rightsStatus: "permitted", matchConfidence: 0.95, status: "approved", sentiment: "positive", ...o,
  });
  it("shows the paraphrase and link, but no rating unless rating_display_permitted", () => {
    const p = toPublicExternalReview(rec())!;
    expect(p.excerpt).toBe("Parents liked the coaching.");
    expect(p.paraphrased).toBe(true);
    expect(p.rating).toBeNull();
    expect(p.sentiment).toBe("positive");
    expect(toPublicExternalReview(rec({ ratingDisplayPermitted: true }))!.rating).toBe(4.5);
  });
  it("link_only rows keep platform, date and sentiment but hide text", () => {
    const p = toPublicExternalReview(rec({ rightsStatus: "link_only" }))!;
    expect(p.excerpt).toBeNull();
    expect(p.reviewDate).toBe("2026-05-01");
    expect(p.platformName).toBe("Reddit");
    expect(p.sentiment).toBe("positive");
  });
  it("maps the public view row", () => {
    const p = mapExternalPublicRow({ id: "1", platform_name: "Google", source_url: "https://g.co", provenance_type: "public_page",
      referenced_name: "X", attribution: "Paraphrased from Google", rights_status: "permitted", sentiment: "mixed", excerpt: "Mixed." });
    expect(p.paraphrased).toBe(true);
    expect(p.sentiment).toBe("mixed");
  });
});
