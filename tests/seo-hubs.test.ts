import { describe, expect, it } from "vitest";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import { buildHubIndex, campsInScope, cityHubs, hubIntro, isUpcoming, relatedCamps, seasonLabel, stateHubs } from "@/lib/seo/hubs";
import { campPageTitle } from "@/lib/seo/jsonld";
import type { CampSummary } from "@/lib/types";

const base = SAMPLE_CAMPS[0];
const mk = (i: number, over: Partial<CampSummary>): CampSummary => ({ ...base, id: `id${i}`, slug: `s${i}`, isSample: false, status: "published", ...over });

const camps = [
  mk(1, { sport: "baseball", state: "CA", city: "San Diego", startDate: "2026-12-01", endDate: null, priceCents: 15000, eventType: "prospect_camp", institutionName: "SDSU", institutionSlug: "sdsu", association: "NCAA", division: "D1" }),
  mk(2, { sport: "baseball", state: "CA", city: "San Diego", startDate: "2027-01-10", endDate: "2027-01-11", priceCents: 30000, eventType: "showcase", institutionName: null, institutionSlug: null, association: null, division: null }),
  mk(3, { sport: "baseball", state: "CA", city: "San Diego", startDate: "2027-02-01", endDate: null, priceCents: null, eventType: "showcase", institutionName: "SDSU", institutionSlug: "sdsu", association: "NCAA", division: "D1" }),
  mk(4, { sport: "baseball", state: "AZ", city: "Mesa", startDate: "2026-12-05", endDate: null, priceCents: 9900, eventType: "id_camp" }),
  mk(5, { sport: "baseball", state: "CA", city: "Fresno", startDate: "2026-01-01", endDate: null }), // past
];
const index = buildHubIndex(camps, "2026-11-03");

describe("SEO hubs", () => {
  it("counts only upcoming public listings", () => {
    expect(isUpcoming({ startDate: "2026-01-01", endDate: null }, "2026-11-03")).toBe(false);
    expect(index.upcoming).toHaveLength(4);
    expect(campsInScope(index, { sport: "baseball", state: "CA" })).toHaveLength(3);
  });
  it("only exposes hubs with enough listings", () => {
    expect(stateHubs(index).map((h) => h.path)).toEqual(["/baseball-camps/california"]);
    expect(cityHubs(index).map((h) => h.path)).toEqual(["/baseball-camps/california/san-diego"]);
  });
  it("writes a factual intro from the data", () => {
    const text = hubIntro(campsInScope(index, { sport: "baseball", state: "CA" }), { noun: "baseball camps", where: "in California" }).join(" ");
    expect(text).toContain("3 upcoming baseball camps in California");
    expect(text).toContain("Dec 1, 2026");
    expect(text).toContain("Feb 1, 2027");
    expect(text).toContain("NCAA D1: 2");
    expect(text).toContain("$150 to $300");
    expect(text).toContain("1 listing has not posted a price");
  });
  it("season label and related camps", () => {
    expect(seasonLabel(index.upcoming)).toBe("2026–27");
    expect(relatedCamps(index, camps[0]).map((c) => c.id)).toEqual(["id3", "id2", "id4"]);
  });
  it("camp titles target dates/cost/ages and add the year", () => {
    expect(campPageTitle({ name: "Stanford Baseball Camp", startDate: "2027-01-17", priceCents: 15000, eligibility: "Grades 9-12" })).toBe("Stanford Baseball Camp 2027 | Dates, Cost & Ages");
    expect(campPageTitle({ name: "2026 Fall Camp", startDate: "2026-11-21", priceCents: null, eligibility: null })).toBe("2026 Fall Camp | Dates & Details");
  });
});
