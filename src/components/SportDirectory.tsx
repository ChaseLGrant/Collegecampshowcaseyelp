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
import { getHubIndex } from "@/lib/seo/hub-data";
import { campsInScope, cityHubs, collegeHubs, hubIntro, stateHubs } from "@/lib/seo/hubs";

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
  const [result, options, hubs] = await Promise.all([repo.searchCamps(filters), repo.getFilterOptions(sport), getHubIndex()]);
  const scoped = campsInScope(hubs, { sport, state: state ?? undefined });
  const intro = hubIntro(scoped, {
    noun: `${sportLabel(sport).toLowerCase()} camps, showcases and college prospect events`,
    where: state ? `in ${stateName(state)}` : "",
    showStates: !state,
    showCities: !!state,
  });
  const stateLinks = state ? [] : stateHubs(hubs, sport);
  const cityLinks = cityHubs(hubs, sport, state ?? undefined);
  const collegeLinks = collegeHubs(hubs, { sport }).filter((c) => !state || scoped.some((x) => x.institutionSlug === c.slug)).slice(0, 16);
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
        {intro.length > 0 && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-navy-700">{intro.join(" ")}</p>}
        {(stateLinks.length > 0 || cityLinks.length > 0) && (
          <nav aria-label={`${label} camps by location`} className="mt-4 flex flex-wrap gap-2 text-sm">
            {stateLinks.map((h) => <Link key={h.path} href={h.path} className="chip-off py-1">{stateName(h.state)} ({h.count})</Link>)}
            {cityLinks.map((h) => <Link key={h.path} href={h.path} className="chip-off py-1">{h.city}, {h.state} ({h.count})</Link>)}
          </nav>
        )}
        <DirectoryResults basePath={basePath} filters={filters} result={result} options={options} showSport={false} sportInUrl={false} />
        {collegeLinks.length > 0 && (
          <section className="mt-10" aria-labelledby="colleges-h">
            <h2 id="colleges-h" className="h2">{label} camps by college{state ? ` in ${stateName(state)}` : ""}</h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {collegeLinks.map((c) => <li key={c.slug}><Link href={c.path} className="chip-off py-1">{c.name}</Link></li>)}
            </ul>
          </section>
        )}
        <div className="mx-auto mt-10 max-w-xl">
          <LeadCaptureForm variant="alerts" sport={sport} sourcePage={basePath} enabled={databaseConfigured()} />
        </div>
      </div>
    </>
  );
}
