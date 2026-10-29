import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildResearchFacts } from "@/lib/research/facts";
import { templateSummary, validateAiOutput } from "@/lib/research/summarize";
import { campJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { safeHttpUrl, safeNextPath } from "@/lib/security/urls";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import type { CampDetail } from "@/lib/types";

const real = (over: Partial<CampDetail> = {}): CampDetail => ({ ...SAMPLE_CAMPS[0], isSample: false, ...over });

describe("research facts and summaries", () => {
  it("labels facts by kind and separates advertised claims", () => {
    const facts = buildResearchFacts(real({ participatingColleges: [{ name: "Rice", verified: false, sourceUrl: null }] }), []);
    expect(facts.some((f) => f.kind === "advertised_claim" && f.text.includes("not independently verified"))).toBe(true);
    expect(facts.some((f) => f.kind === "community_opinion" && f.text.includes("No CampGrade community reviews"))).toBe(true);
  });
  it("template summary uses only listing facts and disclaims outcomes", () => {
    const s = templateSummary(real(), buildResearchFacts(real(), []));
    expect(s.method).toBe("template");
    expect(s.considerations.join(" ")).toMatch(/No camp can guarantee/);
  });
  it("drops uncited or fabricated-citation sentences from AI output", () => {
    const facts = buildResearchFacts(real(), []);
    const out = validateAiOutput({ summary: "It costs $195 [F3]. Coaches love it. It is in Austin [F99].", considerations: ["Budget for travel.", "This camp guarantees a scholarship offer."] }, facts)!;
    expect(out.summary).toBe("It costs $195 [F3].");
    expect(out.considerations).toEqual(["Budget for travel."]);
  });
  it("rejects AI output with no valid citations", () => {
    expect(validateAiOutput({ summary: "Great camp!", considerations: [] }, buildResearchFacts(real(), []))).toBeNull();
    expect(validateAiOutput("nope", [])).toBeNull();
  });
});

describe("structured data", () => {
  it("never emits structured data for sample listings", () => {
    expect(campJsonLd(SAMPLE_CAMPS[0])).toBeNull();
  });
  it("omits aggregateRating until there are enough native reviews", () => {
    expect(campJsonLd(real())!.aggregateRating).toBeUndefined();
    const ld = campJsonLd(real({ stats: { reviewCount: 4, verifiedCount: 1, avgOverall: 4.25, avgValue: 4, avgInstruction: 4, avgExposure: 4, avgOrganization: 4 } }))!;
    expect(ld.aggregateRating).toMatchObject({ ratingValue: "4.3", reviewCount: 4 });
  });
  it("escapes </script> in JSON-LD", () => {
    expect(jsonLdScript({ a: "</script><script>" })).not.toContain("</script>");
  });
});

describe("URL safety", () => {
  it("only allows http(s) links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("https://ok.edu/x")).toBe("https://ok.edu/x");
  });
  it("blocks open redirects after login", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/camps/x/review?resume=1")).toBe("/camps/x/review?resume=1");
  });
});

describe("community review protection", () => {
  const root = path.resolve(__dirname, "../src/lib");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
  it("ingestion, external-review and research code never writes to the reviews table", () => {
    const scoped = [...files(path.join(root, "ingestion")), ...files(path.join(root, "external-reviews")), ...files(path.join(root, "research")), path.join(root, "admin/approve.ts"), path.join(root, "admin/ingestion-store.ts")];
    for (const f of scoped) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\(["']reviews["']\)/);
  });
  it("the database blocks non-author edits to review content", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/20261029000001_core_schema.sql"), "utf8");
    expect(sql).toMatch(/create trigger reviews_content_guard/);
    expect(sql).toMatch(/Review content can only be edited by its author/);
  });
});
