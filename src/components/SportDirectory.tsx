import Link from "next/link";
import { DirectoryResults } from "./DirectoryResults";
import { RememberSport } from "./RememberSport";
import { SampleBanner } from "./SampleBanner";
import { SearchBar } from "./SearchBar";
import { SportChips } from "./SportChips";
import { LeadCaptureForm } from "./LeadCaptureForm";
import { getPublicRepository } from "@/lib/data";
import { databaseConfigured } from "@/lib/env";
import { parseSearchFilters } from "@/lib/search";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { SPORTS, directoryPath, sportLabel, type SportId } from "@/lib/sports";
import { stateName, stateSlug } from "@/lib/states";

const INTROS: Partial<Record<SportId, string>> = {
  baseball: "Compare college baseball prospect camps, showcases and ID camps by cost, location, verified school level and first-hand reviews from families who attended.",
  softball: "Find college softball camps and recruiting showcases, with real costs, dates and reviews from parents and athletes.",
  football: "Research college football prospect camps and combines before you register — prices, dates, verified host programs and community reviews.",
  basketball: "Browse college basketball elite camps and showcases with transparent costs and honest reviews.",
  soccer: "Find college soccer ID camps near you and compare cost, dates, host program level and reviews.",
  volleyball: "Compare college volleyball camps and clinics by price, location and first-hand reviews.",
  lacrosse: "Research college lacrosse prospect days and showcases with costs, dates and community reviews.",
};

export async function SportDirectory({ sport, state, searchParams }: {
  sport: SportId; state: string | null; searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseSearchFilters({ ...searchParams, sport, state: state ?? (searchParams.state as string | undefined) });
  const repo = await getPublicRepository();
  const [result, options] = await Promise.all([repo.searchCamps(filters), repo.getFilterOptions(sport)]);
  const basePath = state ? `${directoryPath(sport)}/${stateSlug(state)}` : directoryPath(sport);
  const hrefs: Record<string, string> = { all: "/search?sport=all" };
  SPORTS.forEach((s) => (hrefs[s.id] = s.id === "other" ? "/search?sport=other" : directoryPath(s.id)));
  const label = sportLabel(sport);
  const crumbs = [{ name: "Camp Check", path: "/" }, { name: `${label} camps`, path: directoryPath(sport) }];
  if (state) crumbs.push({ name: stateName(state), path: basePath });

  return (
    <>
      <RememberSport sport={sport} />
      <SampleBanner mode={repo.mode} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(crumbs)) }} />
      <div className="container-page py-6">
        <SearchBar sport={sport} size="md" />
        <div className="mt-3"><SportChips active={sport} hrefs={hrefs} /></div>
        <nav aria-label="Breadcrumb" className="mt-6 text-sm muted">
          <Link href="/" className="hover:text-brand">Home</Link> /{" "}
          {state ? <><Link href={directoryPath(sport)} className="hover:text-brand">{label} camps</Link> / {stateName(state)}</> : `${label} camps`}
        </nav>
        <h1 className="mt-2 h1">{state ? `${label} camps & showcases in ${stateName(state)}` : `College ${label.toLowerCase()} camps & showcases`}</h1>
        <p className="mt-2 max-w-3xl muted">{INTROS[sport]}</p>
        {!state && options.states.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {options.states.filter((s) => s.count >= 3).slice(0, 20).map((s) => (
              <Link key={s.code} href={`${directoryPath(sport)}/${stateSlug(s.code)}`} className="chip-off py-1">{stateName(s.code)}</Link>
            ))}
          </div>
        )}
        <DirectoryResults basePath={basePath} filters={filters} result={result} options={options} showSport={false} sportInUrl={false} />
        <div className="mx-auto mt-10 max-w-xl">
          <LeadCaptureForm variant="alerts" sport={sport} sourcePage={basePath} enabled={databaseConfigured()} />
        </div>
      </div>
    </>
  );
}
