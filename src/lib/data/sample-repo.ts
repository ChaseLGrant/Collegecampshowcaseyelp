import type { CampRepository } from "./repository";
import { filterAndSortCamps } from "./filter";
import { SAMPLE_CAMPS } from "./sample";

function makeMemoryRepo(camps: typeof SAMPLE_CAMPS, mode: "sample" | "empty"): CampRepository {
  return {
    mode,
    async searchCamps(f) {
      return filterAndSortCamps(camps, f);
    },
    async getCampBySlug(slug) {
      return camps.find((c) => c.slug === slug) ?? null;
    },
    async getCampsBySlugs(slugs) {
      return slugs.map((s) => camps.find((c) => c.slug === s)).filter((c): c is (typeof camps)[number] => !!c);
    },
    async listReviews() {
      return [];
    },
    async listExternalReviews() {
      return [];
    },
    async getResearchSummary() {
      return null;
    },
    async getFilterOptions(sport) {
      const pool = sport ? camps.filter((c) => c.sport === sport) : camps;
      const counts = new Map<string, number>();
      pool.forEach((c) => c.state && counts.set(c.state, (counts.get(c.state) ?? 0) + 1));
      const colleges = new Map<string, string>();
      pool.forEach((c) => c.institutionName && c.institutionSlug && colleges.set(c.institutionSlug, c.institutionName));
      return {
        states: [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
        colleges: [...colleges].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
    async countBySport() {
      const out: Record<string, number> = {};
      camps.forEach((c) => (out[c.sport] = (out[c.sport] ?? 0) + 1));
      return out;
    },
    async listPublishedSlugs() {
      return []; // sample pages are never put in the sitemap
    },
  };
}

export const sampleRepository = makeMemoryRepo(SAMPLE_CAMPS, "sample");
export const emptyRepository = makeMemoryRepo([], "empty");
