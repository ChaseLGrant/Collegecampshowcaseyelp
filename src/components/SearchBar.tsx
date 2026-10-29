import type { SportId } from "@/lib/sports";

/** Plain GET form — works without JavaScript and needs no account. */
export function SearchBar({ defaultQuery, sport, size = "lg", autoFocus = false }: {
  defaultQuery?: string; sport?: SportId | null; size?: "lg" | "md"; autoFocus?: boolean;
}) {
  return (
    <form action="/search" method="get" role="search" className="w-full">
      <label htmlFor="q" className="sr-only">Search camps</label>
      <div className={`flex items-stretch gap-2 rounded-xl border border-navy-100 bg-white p-1.5 shadow-card focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20`}>
        <svg className="ml-2 mt-auto mb-auto shrink-0 text-navy-300" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path fill="currentColor" d="M8.5 2a6.5 6.5 0 015.2 10.4l4 4-1.3 1.3-4-4A6.5 6.5 0 118.5 2zm0 2a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
        </svg>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="College, camp, organizer, or city"
          className={`min-w-0 flex-1 bg-transparent px-1 text-navy placeholder:text-navy-300 focus:outline-none ${size === "lg" ? "py-2.5 text-base sm:text-lg" : "py-1.5 text-base sm:text-sm"}`}
        />
        <input type="hidden" name="sport" value={sport ?? "all"} />
        <button type="submit" className="btn-primary shrink-0 px-5">Search</button>
      </div>
    </form>
  );
}
