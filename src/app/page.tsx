import type { Metadata } from "next";
import Link from "next/link";
import { CampCard } from "@/components/CampCard";
import { SampleBanner } from "@/components/SampleBanner";
import { SearchBar } from "@/components/SearchBar";
import { SportChips } from "@/components/SportChips";
import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { getPublicRepository } from "@/lib/data";
import { databaseConfigured } from "@/lib/env";
import { parseSearchFilters } from "@/lib/search";
import { EDITORIAL_EXPLAINER } from "@/lib/editorial";
import { getStickySport } from "@/lib/server/sticky-sport";
import { DIRECTORY_SPORTS, SPORTS, directoryPath, sportLabel } from "@/lib/sports";
import { getHubIndex } from "@/lib/seo/hub-data";
import { cityHubs, collegeHubs, stateHubs } from "@/lib/seo/hubs";
import { pageMetadata } from "@/lib/seo/meta";

export const metadata: Metadata = pageMetadata({
  title: "Camp Check: College Prospect Camps, ID Camps & Showcases",
  description: "Compare college recruiting camps, prospect camps, ID camps and showcases in baseball, softball, football, basketball, soccer, volleyball and lacrosse: dates, costs and host programs.",
  path: "/",
});

export default async function HomePage() {
  const sport = await getStickySport();
  const repo = await getPublicRepository();
  const [picks, upcoming, counts, hubs] = await Promise.all([
    repo.searchCamps(parseSearchFilters({ sort: "editorial", editorsPick: "1", pageSize: "6" }, sport)),
    repo.searchCamps(parseSearchFilters({ sort: "date", pageSize: "6" }, sport)),
    repo.countBySport(),
    getHubIndex(),
  ]);
  const popular = [...stateHubs(hubs), ...cityHubs(hubs)].sort((a, b) => b.count - a.count).slice(0, 18);
  const colleges = collegeHubs(hubs, { indexableOnly: true }).slice(0, 12);
  const picksHref = `/search?${new URLSearchParams({ sport: sport ?? "all", editorsPick: "1", sort: "editorial" })}`;
  const hrefs: Record<string, string> = { all: "/search?sport=all" };
  SPORTS.forEach((s) => (hrefs[s.id] = s.id === "other" ? "/search?sport=other" : directoryPath(s.id)));

  return (
    <>
      <SampleBanner mode={repo.mode} />
      <section className="border-b border-navy-50 bg-gradient-to-b from-navy-50 to-white">
        <div className="container-page py-12 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Find Camps Worth Your Money.</h1>
          <p className="mt-3 max-w-2xl text-lg text-navy-500">
            Real reviews, independent research, and recruiting camp intelligence—all in one place.
          </p>
          <div className="mt-8 max-w-3xl">
            <SearchBar sport={sport} />
            <div className="mt-4">
              <SportChips active={sport} hrefs={hrefs} showAll={false} wrap />
            </div>
          </div>
        </div>
      </section>

      {picks.items.length > 0 && (
        <section className="container-page pt-10" aria-labelledby="picks-h">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="picks-h" className="h2">{sport ? `Editor's Picks: ${sportLabel(sport).toLowerCase()}` : "Editor's Picks"}</h2>
              <p className="text-sm muted">{EDITORIAL_EXPLAINER}</p>
            </div>
            <Link href={picksHref} className="link shrink-0 text-sm">See all picks</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {picks.items.map((c) => <CampCard key={c.id} camp={c} showSport={!sport} />)}
          </div>
        </section>
      )}

      <section className="container-page py-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="h2">{sport ? `Upcoming ${sportLabel(sport).toLowerCase()} camps` : "Upcoming camps & showcases"}</h2>
          <Link href={sport && sport !== "other" ? directoryPath(sport) : `/search?sport=${sport ?? "all"}`} className="link text-sm">See all</Link>
        </div>
        {upcoming.items.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.items.map((c) => <CampCard key={c.id} camp={c} showSport={!sport} />)}
          </div>
        ) : (
          <p className="mt-4 muted">No upcoming events listed yet. <Link className="link" href="/submit-camp">Know of one? Submit it.</Link></p>
        )}
      </section>

      <section className="container-page py-6">
        <div className="mx-auto max-w-xl">
          <LeadCaptureForm variant="alerts" sport={sport} sourcePage="/" enabled={databaseConfigured()} />
        </div>
      </section>

      <section className="container-page py-6">
        <h2 className="h2">Browse by sport</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DIRECTORY_SPORTS.map((s) => (
            <li key={s}>
              <Link href={directoryPath(s)} className="card block p-4 hover:border-brand/40">
                <span className="font-semibold">{sportLabel(s)}</span>
                <span className="block text-sm muted">{counts[s] ?? 0} listed</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {(popular.length > 0 || colleges.length > 0) && (
        <section className="container-page py-6" aria-labelledby="popular-h">
          <h2 id="popular-h" className="h2">Popular camp searches</h2>
          {popular.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {popular.map((h) => <li key={h.path}><Link href={h.path} className="chip-off py-1">{h.label}</Link></li>)}
            </ul>
          )}
          {colleges.length > 0 && (
            <>
              <h3 className="mt-6 font-semibold">Camps by college</h3>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {colleges.map((c) => <li key={c.path}><Link href={c.path} className="chip-off py-1">{c.name} camps</Link></li>)}
                <li><Link href="/colleges" className="link py-1">All colleges →</Link></li>
              </ul>
            </>
          )}
        </section>
      )}

      <section className="container-page py-10">
        <h2 className="h2">Three kinds of information, never mixed</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="font-semibold">Camp Check Community Reviews</p>
            <p className="mt-1 text-sm muted">First-hand reviews from parents and athletes who attended, rated on value, instruction, coach exposure, organization and overall experience.</p>
          </div>
          <div className="card p-5">
            <p className="font-semibold">External Review Sources</p>
            <p className="mt-1 text-sm muted">Third-party information shown with its source and a link to the original. Never blended into our star ratings.</p>
          </div>
          <div className="card p-5">
            <p className="font-semibold">Camp Check Research Summary</p>
            <p className="mt-1 text-sm muted">AI-assisted research built only from verifiable facts, reviewed by our team, and clearly labeled as research — not a review.</p>
          </div>
        </div>
        <p className="mt-4 text-sm"><Link href="/methodology" className="link">How our ratings and research work →</Link></p>
      </section>
    </>
  );
}
