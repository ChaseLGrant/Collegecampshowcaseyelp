import Link from "next/link";
import { filtersToQuery, type SearchFilters } from "@/lib/search";

export function Pagination({ basePath, filters, total, omitSport }: { basePath: string; filters: SearchFilters; total: number; omitSport?: boolean }) {
  const pages = Math.ceil(total / filters.pageSize);
  if (pages <= 1) return null;
  const href = (page: number) => {
    const q = filtersToQuery({ ...filters, sport: omitSport ? undefined : filters.sport ?? undefined }, { page });
    return `${basePath}${q ? `?${q}` : ""}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2 text-sm">
      {filters.page > 1 && <Link className="btn-secondary" href={href(filters.page - 1)}>Previous</Link>}
      <span className="muted">Page {filters.page} of {pages}</span>
      {filters.page < pages && <Link className="btn-secondary" href={href(filters.page + 1)}>Next</Link>}
    </nav>
  );
}
