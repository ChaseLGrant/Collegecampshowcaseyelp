import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SportDirectory } from "@/components/SportDirectory";
import { directoryTitle } from "@/lib/seo/jsonld";
import { DIRECTORY_SPORTS, directoryPath, sportFromDirectorySegment, sportLabel } from "@/lib/sports";

type Params = { directory: string };

export function generateStaticParams(): Params[] {
  return DIRECTORY_SPORTS.map((s) => ({ directory: `${s}-camps` }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const sport = sportFromDirectorySegment((await params).directory);
  if (!sport) return {};
  return {
    title: directoryTitle(sportLabel(sport)),
    description: `Best college ${sportLabel(sport).toLowerCase()} camps, prospect camps and showcases — real reviews, costs and dates from CampGrade.`,
    alternates: { canonical: directoryPath(sport) },
  };
}

export default async function DirectoryPage({ params, searchParams }: {
  params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sport = sportFromDirectorySegment((await params).directory);
  if (!sport) notFound();
  return <SportDirectory sport={sport} state={null} searchParams={await searchParams} />;
}
