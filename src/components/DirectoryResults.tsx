import Link from "next/link";
import type { SearchResult, FilterOptions } from "@/lib/data/repository";
import type { SearchFilters } from "@/lib/search";
import { CampCard } from "./CampCard";
import { Filters } from "./Filters";
import { Pagination } from "./Pagination";

export function DirectoryResults({ basePath, filters, result, options, showSport, sportInUrl }: {
  basePath: string; filters: SearchFilters; result: SearchResult; options: FilterOptions; showSport: boolean; sportInUrl: boolean;
}) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Filters action={basePath} filters={filters} options={options} hideSport={!sportInUrl} />
      </aside>
      <div>
        <p className="text-sm muted" aria-live="polite">
          {result.total} {result.total === 1 ? "event" : "events"}
        </p>
        {result.items.length ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {result.items.map((c) => <CampCard key={c.id} camp={c} showSport={showSport} />)}
          </div>
        ) : (
          <div className="card mt-3 p-6 text-center">
            <p className="font-semibold">No events match these filters.</p>
            <p className="mt-1 text-sm muted">Try removing a filter, or <Link className="link" href="/submit-camp">submit a camp we&apos;re missing</Link>.</p>
          </div>
        )}
        <Pagination basePath={basePath} filters={filters} total={result.total} omitSport={!sportInUrl} />
      </div>
    </div>
  );
}
