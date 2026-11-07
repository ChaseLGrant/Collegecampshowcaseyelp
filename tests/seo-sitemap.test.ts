import { describe, expect, it } from "vitest";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import { buildHubIndex, pastCampsInScope } from "@/lib/seo/hubs";
import { latestUpdate } from "@/lib/seo/sitemap-dates";
import type { CampSummary } from "@/lib/types";

const base = SAMPLE_CAMPS[0];
const mk = (i: number, over: Partial<CampSummary>): CampSummary => ({ ...base, id: `id${i}`, slug: `s${i}`, isSample: false, status: "published", ...over });

describe("sitemap lastmod", () => {
  it("takes the newest real timestamp and never invents one", () => {
    expect(latestUpdate(["2026-11-02T14:07:16.171Z", null, "2026-10-30T02:20:00Z", "not a date"])?.toISOString()).toBe("2026-11-02T14:07:16.171Z");
    expect(latestUpdate([null, undefined])).toBeUndefined();
    expect(latestUpdate([])).toBeUndefined();
  });
});

describe("past listings for crawl links", () => {
  const index = buildHubIndex([
    mk(1, { sport: "baseball", state: "CA", startDate: "2026-10-01", endDate: null }),
    mk(2, { sport: "baseball", state: "CA", startDate: "2026-09-01", endDate: null }),
    mk(3, { sport: "baseball", state: "CA", startDate: "2026-12-01", endDate: null }),
    mk(4, { sport: "baseball", state: "CA", startDate: "2026-08-01", endDate: null, status: "cancelled" }),
    mk(5, { sport: "soccer", state: "CA", startDate: "2026-08-01", endDate: null }),
  ], "2026-11-07");
  it("returns only published past camps in scope, newest first", () => {
    expect(pastCampsInScope(index, { sport: "baseball" }).map((c) => c.id)).toEqual(["id1", "id2"]);
    expect(pastCampsInScope(index, { sport: "baseball", state: "AZ" })).toEqual([]);
  });
});
