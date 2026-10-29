import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SportDirectory } from "@/components/SportDirectory";
import { getPublicRepository } from "@/lib/data";
import { MIN_LISTINGS_FOR_INDEXED_STATE_PAGE, directoryTitle } from "@/lib/seo/jsonld";
import { directoryPath, sportFromDirectorySegment, sportLabel } from "@/lib/sports";
import { stateFromSlug, stateName, stateSlug } from "@/lib/states";

type Params = { directory: string; state: string };

async function resolve(params: Promise<Params>) {
  const p = await params;
  const sport = sportFromDirectorySegment(p.directory);
  const state = stateFromSlug(p.state);
  if (!sport || !state || stateSlug(state) !== p.state) return null;
  return { sport, state };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const opts = await getPublicRepository().getFilterOptions(r.sport);
  const count = opts.states.find((s) => s.code === r.state)?.count ?? 0;
  return {
    title: directoryTitle(sportLabel(r.sport), r.state),
    description: `${sportLabel(r.sport)} camps, ID camps and showcases in ${stateName(r.state)} with costs, dates and reviews.`,
    alternates: { canonical: `${directoryPath(r.sport)}/${stateSlug(r.state)}` },
    // Avoid thin pages: only index states with enough real listings.
    robots: count >= MIN_LISTINGS_FOR_INDEXED_STATE_PAGE ? undefined : { index: false, follow: true },
  };
}

export default async function StateDirectoryPage({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const r = await resolve(params);
  if (!r) notFound();
  return <SportDirectory sport={r.sport} state={r.state} searchParams={await searchParams} />;
}
