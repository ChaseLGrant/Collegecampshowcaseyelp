import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SportDirectory } from "@/components/SportDirectory";
import { getHubIndex } from "@/lib/seo/hub-data";
import { campsInScope, hubDescription, seasonLabel } from "@/lib/seo/hubs";
import { hasQueryParams, pageMetadata } from "@/lib/seo/meta";
import { DIRECTORY_SPORTS, directoryPath, sportFromDirectorySegment, sportLabel } from "@/lib/sports";

type Params = { directory: string };

export function generateStaticParams(): Params[] {
  return DIRECTORY_SPORTS.map((s) => ({ directory: `${s}-camps` }));
}
export const dynamicParams = false;

export async function generateMetadata({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sport = sportFromDirectorySegment((await params).directory);
  if (!sport) return {};
  const label = sportLabel(sport);
  const camps = campsInScope(await getHubIndex(), { sport });
  const season = seasonLabel(camps);
  return pageMetadata({
    title: `College ${label} Camps${season ? ` ${season}` : ""} | Prospect & ID Camps, Showcases`,
    description: camps.length
      ? hubDescription(camps, `College ${label.toLowerCase()} camps, prospect camps and showcases`)
      : `College ${label.toLowerCase()} camps, prospect camps and showcases with dates, costs and host programs.`,
    path: directoryPath(sport),
    // Filtered, sorted or paginated views are not separate pages for search engines.
    noindex: hasQueryParams(await searchParams),
  });
}

export default async function DirectoryPage({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sport = sportFromDirectorySegment((await params).directory);
  if (!sport) notFound();
  return <SportDirectory sport={sport} state={null} searchParams={await searchParams} />;
}
