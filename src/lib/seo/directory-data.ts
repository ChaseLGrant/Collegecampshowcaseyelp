import "server-only";
import { unstable_cache } from "next/cache";
import { getPublicRepository } from "../data";
import type { SearchFilters } from "../search";
import type { SportId } from "../sports";
import { HUBS_TAG } from "./hub-data";

/**
 * Sport / state directory pages read the query string (filters, paging), so they are rendered per
 * request. Their database reads are cached across requests for an hour instead, keyed by the
 * filters (same freshness as the hub index; the daily refresh and admin edits purge "hubs").
 */
export const cachedFilterOptions = unstable_cache(
  async (sport: SportId) => (await getPublicRepository()).getFilterOptions(sport),
  ["directory-filter-options-v1"],
  { revalidate: 3600, tags: [HUBS_TAG] },
);

export const cachedSearch = unstable_cache(
  async (filters: SearchFilters) => (await getPublicRepository()).searchCamps(filters),
  ["directory-search-v1"],
  { revalidate: 3600, tags: [HUBS_TAG] },
);
