import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampCard } from "@/components/CampCard";
import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { databaseConfigured } from "@/lib/env";
import { getHubIndex } from "@/lib/seo/hub-data";
import {
  MIN_LISTINGS_FOR_INDEXED_HUB, campsInScope, citySlug, collegeHubs, hubDescription, hubIntro, seasonLabel, sportCityPath, sportStatePath,
} from "@/lib/seo/hubs";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/meta";
import { directoryPath, sportFromDirectorySegment, sportLabel } from "@/lib/sports";
import { stateFromSlug, stateName, stateSlug } from "@/lib/states";

type Params = { directory: string; state: string; city: string };

/** Resolves a sport + state + city hub from real listings only; unknown cities 404. */
async function resolve(params: Promise<Params>) {
  const p = await params;
  const sport = sportFromDirectorySegment(p.directory);
  const state = stateFromSlug(p.state);
  if (!sport || !state || stateSlug(state) !== p.state) return null;
  const index = await getHubIndex();
  const any = campsInScope(index, { sport, state, city: p.city }, index.all);
  const cityName = any.find((c) => c.city && citySlug(c.city) === p.city)?.city;
  if (!cityName || citySlug(cityName) !== p.city) return null;
  return { sport, state, city: cityName, slug: p.city, index, camps: campsInScope(index, { sport, state, city: p.city }) };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const label = sportLabel(r.sport);
  const season = seasonLabel(r.camps);
  return pageMetadata({
    title: `${label} Camps in ${r.city}, ${r.state}${season ? ` ${season}` : ""} | Dates & Costs`,
    description: r.camps.length
      ? hubDescription(r.camps, `${label} camps and showcases in ${r.city}, ${stateName(r.state)}`)
      : `${label} camps and showcases in ${r.city}, ${stateName(r.state)}.`,
    path: sportCityPath(r.sport, r.state, r.city),
    noindex: r.camps.length < MIN_LISTINGS_FOR_INDEXED_HUB,
  });
}

export default async function CityDirectoryPage({ params }: { params: Promise<Params> }) {
  const r = await resolve(params);
  if (!r) notFound();
  const label = sportLabel(r.sport);
  const path = sportCityPath(r.sport, r.state, r.city);
  const crumbs = [
    { name: "Camp Check", path: "/" },
    { name: `${label} camps`, path: directoryPath(r.sport) },
    { name: stateName(r.state), path: sportStatePath(r.sport, r.state) },
    { name: r.city, path },
  ];
  const intro = hubIntro(r.camps, { noun: `${label.toLowerCase()} camps, showcases and college prospect events`, where: `in ${r.city}, ${stateName(r.state)}` });
  const colleges = collegeHubs(r.index, { sport: r.sport }).filter((c) => r.camps.some((x) => x.institutionSlug === c.slug));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(crumbs)) }} />
      <div className="container-page py-6">
        <nav aria-label="Breadcrumb" className="text-sm muted">
          <Link href="/" className="hover:text-brand">Home</Link> /{" "}
          <Link href={directoryPath(r.sport)} className="hover:text-brand">{label} camps</Link> /{" "}
          <Link href={sportStatePath(r.sport, r.state)} className="hover:text-brand">{stateName(r.state)}</Link> / {r.city}
        </nav>
        <h1 className="mt-2 h1">{label} camps &amp; showcases in {r.city}, {r.state}</h1>
        {intro.length > 0 ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-navy-700">{intro.join(" ")}</p>
        ) : (
          <p className="mt-2 max-w-3xl muted">No upcoming {label.toLowerCase()} events are listed in {r.city} right now. <Link className="link" href={sportStatePath(r.sport, r.state)}>See all of {stateName(r.state)}</Link>.</p>
        )}
        {r.camps.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {r.camps.map((c) => <CampCard key={c.id} camp={c} />)}
          </div>
        )}
        {colleges.length > 0 && (
          <section className="mt-10">
            <h2 className="h2">Host colleges</h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {colleges.map((c) => <li key={c.slug}><Link href={c.path} className="chip-off py-1">{c.name}</Link></li>)}
            </ul>
          </section>
        )}
        <p className="mt-8 text-sm">
          <Link className="link" href={sportStatePath(r.sport, r.state)}>All {label.toLowerCase()} camps in {stateName(r.state)} →</Link>
        </p>
        <div className="mx-auto mt-10 max-w-xl">
          <LeadCaptureForm variant="alerts" sport={r.sport} sourcePage={path} enabled={databaseConfigured()} />
        </div>
      </div>
    </>
  );
}
