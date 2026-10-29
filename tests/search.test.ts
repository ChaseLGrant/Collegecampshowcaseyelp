import { describe, expect, it } from "vitest";
import { filtersToQuery, parseSearchFilters } from "@/lib/search";
import { filterAndSortCamps } from "@/lib/data/filter";
import { SAMPLE_CAMPS } from "@/lib/data/sample";
import { sportFromDirectorySegment } from "@/lib/sports";

describe("parseSearchFilters", () => {
  it("drops invalid values instead of failing", () => {
    const f = parseSearchFilters({ sport: "curling", maxPrice: "abc", page: "-3", state: "Texas", sort: "weird" });
    expect(f.sport).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
    expect(f.page).toBe(1);
    expect(f.state).toBe("TX");
    expect(f.sort).toBe("date");
  });
  it("applies the remembered sport only when the URL doesn't mention sport", () => {
    expect(parseSearchFilters({}, "baseball").sport).toBe("baseball");
    expect(parseSearchFilters({ sport: "soccer" }, "baseball").sport).toBe("soccer");
    expect(parseSearchFilters({ sport: "all" }, "baseball").sport).toBeUndefined();
  });
  it("swaps reversed price ranges", () => {
    const f = parseSearchFilters({ minPrice: "300", maxPrice: "100" });
    expect([f.minPrice, f.maxPrice]).toEqual([100, 300]);
  });
  it("round-trips to a compact query string", () => {
    const f = parseSearchFilters({ q: "texas", sport: "baseball", page: "2" });
    expect(filtersToQuery(f)).toBe("q=texas&sport=baseball&page=2");
  });
});

describe("directory routing", () => {
  it("maps /{sport}-camps segments", () => {
    expect(sportFromDirectorySegment("baseball-camps")).toBe("baseball");
    expect(sportFromDirectorySegment("other-camps")).toBeNull();
    expect(sportFromDirectorySegment("baseball")).toBeNull();
    expect(sportFromDirectorySegment("chess-camps")).toBeNull();
  });
});

describe("filterAndSortCamps", () => {
  it("filters by sport and state", () => {
    const r = filterAndSortCamps(SAMPLE_CAMPS, parseSearchFilters({ sport: "baseball", state: "TX" }));
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((c) => c.sport === "baseball" && c.state === "TX")).toBe(true);
  });
  it("only matches association filters on verified classifications", () => {
    const camps = SAMPLE_CAMPS.map((c) => ({ ...c, classificationVerified: false }));
    expect(filterAndSortCamps(camps, parseSearchFilters({ association: "NCAA" })).total).toBe(0);
  });
  it("excludes camps without a price from price filters", () => {
    const r = filterAndSortCamps(SAMPLE_CAMPS, parseSearchFilters({ maxPrice: "100000" }));
    expect(r.items.every((c) => c.priceCents != null)).toBe(true);
  });
  it("never matches unreviewed camps on a minimum rating", () => {
    expect(filterAndSortCamps(SAMPLE_CAMPS, parseSearchFilters({ minRating: "1" })).total).toBe(0);
  });
  it("searches across name, school and city", () => {
    const r = filterAndSortCamps(SAMPLE_CAMPS, parseSearchFilters({ q: "madison" }));
    expect(r.items.length).toBeGreaterThan(0);
  });
});
