import { ASSOCIATIONS, EVENT_TYPES } from "@/lib/sports";
import { SORTS, type SearchFilters } from "@/lib/search";
import { stateName } from "@/lib/states";
import type { FilterOptions } from "@/lib/data/repository";

const SORT_LABELS: Record<string, string> = {
  recommended: "Recommended", editorial: "Top rated by CampGrade", relevance: "Best match", date: "Soonest", price_low: "Price: low to high", price_high: "Price: high to low",
  rating: "Parent rating", reviews: "Most parent reviews",
};

/** GET form so filters are shareable URLs and work without JavaScript. */
export function Filters({ action, filters, options, hideSport = true }: {
  action: string; filters: SearchFilters; options: FilterOptions; hideSport?: boolean;
}) {
  const active = [filters.state, filters.college, filters.association, filters.division, filters.eventType,
    filters.minPrice, filters.maxPrice, filters.from, filters.to, filters.minRating, filters.minReviews,
    filters.editorsPick || undefined].filter((v) => v != null).length;
  return (
    <details className="card group p-4 lg:open:block" open={active > 0 ? true : undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        <span>Filters{active ? ` (${active})` : ""}</span>
        <span className="text-sm text-navy-500 group-open:hidden">Show</span>
        <span className="hidden text-sm text-navy-500 group-open:inline">Hide</span>
      </summary>
      <form action={action} method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        {!hideSport && <input type="hidden" name="sport" value={filters.sport ?? "all"} />}
        <div>
          <label className="label" htmlFor="f-sort">Sort by</label>
          <select id="f-sort" name="sort" defaultValue={filters.sort} className="input">
            {SORTS.filter((s) => s !== "relevance" || filters.q).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-state">State</label>
          <select id="f-state" name="state" defaultValue={filters.state ?? ""} className="input">
            <option value="">Any state</option>
            {options.states.map((s) => <option key={s.code} value={s.code}>{stateName(s.code)} ({s.count})</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-college">College</label>
          <input id="f-college" name="college" defaultValue={filters.college ?? ""} list="college-list" className="input" placeholder="Any college" />
          <datalist id="college-list">{options.colleges.slice(0, 300).map((c) => <option key={c.slug} value={c.name} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="f-type">Event type</label>
          <select id="f-type" name="eventType" defaultValue={filters.eventType ?? ""} className="input">
            <option value="">Any type</option>
            {EVENT_TYPES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="f-assoc">Association</label>
            <select id="f-assoc" name="association" defaultValue={filters.association ?? ""} className="input">
              <option value="">Any</option>
              {ASSOCIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-div">Division</label>
            <select id="f-div" name="division" defaultValue={filters.division ?? ""} className="input">
              <option value="">Any</option>
              <option value="D1">D1</option><option value="D2">D2</option><option value="D3">D3</option>
            </select>
          </div>
          <p className="col-span-2 -mt-1 text-xs muted">Only verified classifications match.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="f-min">Min price ($)</label>
            <input id="f-min" name="minPrice" type="number" inputMode="numeric" min={0} defaultValue={filters.minPrice ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="f-max">Max price ($)</label>
            <input id="f-max" name="maxPrice" type="number" inputMode="numeric" min={0} defaultValue={filters.maxPrice ?? ""} className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="f-from">From</label>
            <input id="f-from" name="from" type="date" defaultValue={filters.from ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="f-to">To</label>
            <input id="f-to" name="to" type="date" defaultValue={filters.to ?? ""} className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="f-rating">Min parent rating</label>
            <select id="f-rating" name="minRating" defaultValue={filters.minRating ?? ""} className="input">
              <option value="">Any</option>
              {[4.5, 4, 3.5, 3].map((r) => <option key={r} value={r}>{r}+ stars</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-reviews">Min reviews</label>
            <select id="f-reviews" name="minReviews" defaultValue={filters.minReviews ?? ""} className="input">
              <option value="">Any</option>
              {[1, 3, 5, 10].map((r) => <option key={r} value={r}>{r}+</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="editorsPick" value="1" defaultChecked={filters.editorsPick} /> Editor&apos;s Picks only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="includePast" value="1" defaultChecked={filters.includePast} /> Include past events
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">Apply</button>
          <a href={`${action}${filters.q ? `?q=${encodeURIComponent(filters.q)}` : ""}`} className="btn-secondary">Reset</a>
        </div>
      </form>
    </details>
  );
}
