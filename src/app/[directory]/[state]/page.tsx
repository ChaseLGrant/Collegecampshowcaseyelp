import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SportDirectory } from "@/components/SportDirectory";
import { getHubIndex } from "@/lib/seo/hub-data";
import { MIN_LISTINGS_FOR_INDEXED_HUB, campsInScope, hubDescription, seasonLabel, sportStatePath } from "@/lib/seo/hubs";
import { hasQueryParams, pageMetadata } from "@/lib/seo/meta";
import { sportFromDirectorySegment, sportLabel } from "@/lib/sports";
import { stateFromSlug, stateName, stateSlug } from "@/lib/states";

type Params = { directory: string; state: string };

async function resolve(params: Promise<Params>) {
  const p = await params;
  const sport = sportFromDirectorySegment(p.directory);
  const state = stateFromSlug(p.state);
  if (!sport || !state || stateSlug(state) !== p.state) return null;
  return { sport, state };
}

export async function generateMetadata({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const label = sportLabel(r.sport);
  const camps = campsInScope(await getHubIndex(), { sport: r.sport, state: r.state });
  const season = seasonLabel(camps);
  return pageMetadata({
    title: `${label} Camps in ${stateName(r.state)}${season ? ` ${season}` : ""} | Dates & Costs`,
    description: camps.length
      ? hubDescription(camps, `${label} camps, ID camps and showcases in ${stateName(r.state)}`)
      : `${label} camps, ID camps and showcases in ${stateName(r.state)} with dates, costs and host programs.`,
    path: sportStatePath(r.sport, r.state),
    // Avoid thin pages: only index states with enough real upcoming listings; filtered views never.
    noindex: camps.length < MIN_LISTINGS_FOR_INDEXED_HUB || hasQueryParams(await searchParams),
  });
}

export default async function StateDirectoryPage({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const r = await resolve(params);
  if (!r) notFound();
  return <SportDirectory sport={r.sport} state={r.state} searchParams={await searchParams} />;
}
