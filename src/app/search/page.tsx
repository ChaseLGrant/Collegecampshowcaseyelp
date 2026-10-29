import type { Metadata } from "next";
import { DirectoryResults } from "@/components/DirectoryResults";
import { SampleBanner } from "@/components/SampleBanner";
import { SearchBar } from "@/components/SearchBar";
import { SportChips } from "@/components/SportChips";
import { getPublicRepository } from "@/lib/data";
import { filtersToQuery, parseSearchFilters } from "@/lib/search";
import { getStickySportRaw } from "@/lib/server/sticky-sport";
import { SPORTS, sportLabel } from "@/lib/sports";

export const metadata: Metadata = { title: "Search camps & showcases", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = parseSearchFilters(params, await getStickySportRaw());
  const repo = await getPublicRepository();
  const [result, options] = await Promise.all([repo.searchCamps(filters), repo.getFilterOptions(filters.sport)]);

  const hrefs: Record<string, string> = {};
  const base = { ...filters, page: 1 };
  hrefs.all = `/search?${filtersToQuery({ ...base, sport: undefined })}&sport=all`.replace("?&", "?");
  SPORTS.forEach((s) => (hrefs[s.id] = `/search?${filtersToQuery({ ...base, sport: s.id })}`));

  return (
    <>
      <SampleBanner mode={repo.mode} />
      <div className="container-page py-6">
        <SearchBar defaultQuery={filters.q} sport={filters.sport} size="md" />
        <div className="mt-3"><SportChips active={filters.sport ?? null} hrefs={hrefs} /></div>
        <h1 className="mt-6 text-2xl font-bold">
          {filters.q ? <>Results for &ldquo;{filters.q}&rdquo;</> : filters.sport ? `${sportLabel(filters.sport)} camps & showcases` : "All camps & showcases"}
          {filters.q && filters.sport ? <span className="font-normal muted"> in {sportLabel(filters.sport)}</span> : null}
        </h1>
        <DirectoryResults basePath="/search" filters={filters} result={result} options={options} showSport={!filters.sport} sportInUrl />
      </div>
    </>
  );
}
