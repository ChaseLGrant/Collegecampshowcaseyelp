import type { SearchFilters } from "../search";
import type { SportId } from "../sports";
import type {
  CampDetail, CampSummary, CommunityReview, PublicExternalReview, ResearchSummary,
} from "../types";

export interface SearchResult {
  items: CampSummary[];
  total: number;
}

export interface FilterOptions {
  states: { code: string; count: number }[];
  colleges: { name: string; slug: string }[];
}

/** Read-only public data access used by pages. Admin writes live in src/lib/admin. */
export interface CampRepository {
  readonly mode: "live" | "sample" | "empty";
  searchCamps(filters: SearchFilters): Promise<SearchResult>;
  getCampBySlug(slug: string): Promise<CampDetail | null>;
  getCampsBySlugs(slugs: string[]): Promise<CampDetail[]>;
  listReviews(campId: string): Promise<CommunityReview[]>;
  listExternalReviews(campId: string): Promise<PublicExternalReview[]>;
  /** Returns the newest approved summary the caller may read (RLS enforces tier in live mode). */
  getResearchSummary(campId: string, tier: "free" | "insider" | "elite"): Promise<ResearchSummary | null>;
  getFilterOptions(sport?: SportId): Promise<FilterOptions>;
  countBySport(): Promise<Record<string, number>>;
  listPublishedSlugs(limit: number): Promise<{ slug: string; updatedAt: string | null }[]>;
}
