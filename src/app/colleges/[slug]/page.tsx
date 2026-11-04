import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampCard } from "@/components/CampCard";
import { getHubIndex } from "@/lib/seo/hub-data";
import {
  MIN_LISTINGS_FOR_INDEXED_COLLEGE, campsInScope, collegePath, hubDescription, hubIntro, seasonLabel, sportStatePath, stateHubs,
} from "@/lib/seo/hubs";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/meta";
import { directoryPath, sportLabel, type SportId } from "@/lib/sports";

type Params = { slug: string };

async function resolve(params: Promise<Params>) {
  const { slug } = await params;
  const index = await getHubIndex();
  const all = campsInScope(index, { college: slug }, index.all);
  const name = all.find((c) => c.institutionName)?.institutionName;
  if (!name) return null;
  const upcoming = campsInScope(index, { college: slug });
  const past = all.filter((c) => !upcoming.includes(c));
  const sports = [...new Set(all.map((c) => c.sport))] as SportId[];
  return { slug, name, index, upcoming, past, sports };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const season = seasonLabel(r.upcoming);
  const what = r.sports.length === 1 ? `${sportLabel(r.sports[0])} Camps` : "Camps";
  return pageMetadata({
    title: `${r.name} ${what}${season ? ` ${season}` : ""} | Dates, Cost & Registration`,
    description: r.upcoming.length
      ? hubDescription(r.upcoming, `${r.name} ${what.toLowerCase()}${r.sports.length > 1 ? ` (${r.sports.map((s) => sportLabel(s).toLowerCase()).join(", ")})` : ""}`)
      : `${r.name} camps and prospect events listed on Camp Check.`,
    path: collegePath(r.slug),
    // One listing would duplicate its own camp page, so single-camp colleges stay out of the index.
    noindex: r.upcoming.length < MIN_LISTINGS_FOR_INDEXED_COLLEGE,
  });
}

export default async function CollegePage({ params }: { params: Promise<Params> }) {
  const r = await resolve(params);
  if (!r) notFound();
  const crumbs = [{ name: "Camp Check", path: "/" }, { name: "Colleges", path: "/colleges" }, { name: r.name, path: collegePath(r.slug) }];
  const intro = hubIntro(r.upcoming, { noun: r.sports.length === 1 ? `${sportLabel(r.sports[0]).toLowerCase()} camps and prospect events` : "camps and prospect events", where: `connected to ${r.name}` });
  const states = [...new Set(r.upcoming.map((c) => c.state).filter((s): s is string => !!s))];
  const hubLinks = r.sports.flatMap((s) => stateHubs(r.index, s).filter((h) => states.includes(h.state)));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(crumbs)) }} />
      <div className="container-page py-6">
        <nav aria-label="Breadcrumb" className="text-sm muted">
          <Link href="/" className="hover:text-brand">Home</Link> / <Link href="/colleges" className="hover:text-brand">Colleges</Link> / {r.name}
        </nav>
        <h1 className="mt-2 h1">{r.name} {r.sports.length === 1 ? `${sportLabel(r.sports[0]).toLowerCase()} ` : ""}camps</h1>
        {intro.length > 0 && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-navy-700">{intro.join(" ")}</p>}
        {r.upcoming.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {r.upcoming.map((c) => <CampCard key={c.id} camp={c} showSport={r.sports.length > 1} />)}
          </div>
        ) : (
          <p className="mt-4 muted">No upcoming events are listed for {r.name} right now.</p>
        )}
        {r.past.length > 0 && (
          <section className="mt-10">
            <h2 className="h2">Past and cancelled events</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {r.past.map((c) => <CampCard key={c.id} camp={c} showSport={r.sports.length > 1} />)}
            </div>
          </section>
        )}
        <section className="mt-10">
          <h2 className="h2">Keep browsing</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {r.sports.map((s) => <li key={s}><Link className="chip-off py-1" href={directoryPath(s)}>All {sportLabel(s).toLowerCase()} camps</Link></li>)}
            {hubLinks.map((h) => <li key={h.path}><Link className="chip-off py-1" href={sportStatePath(h.sport, h.state)}>{h.label}</Link></li>)}
            <li><Link className="chip-off py-1" href="/colleges">All colleges</Link></li>
          </ul>
        </section>
      </div>
    </>
  );
}
