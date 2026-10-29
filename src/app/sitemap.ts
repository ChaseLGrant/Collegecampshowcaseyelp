import type { MetadataRoute } from "next";
import { getPublicRepository } from "@/lib/data";
import { env } from "@/lib/env";
import { MIN_LISTINGS_FOR_INDEXED_STATE_PAGE } from "@/lib/seo/jsonld";
import { DIRECTORY_SPORTS, directoryPath } from "@/lib/sports";
import { stateSlug } from "@/lib/states";

export const revalidate = 3600;

/** Only real, published pages with substance are listed — no sample data, no thin state pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getPublicRepository();
  const base = env.siteUrl;
  const out: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/methodology`, changeFrequency: "monthly" },
    { url: `${base}/pricing`, changeFrequency: "monthly" },
  ];
  if (repo.mode !== "live") return out;
  for (const s of DIRECTORY_SPORTS) {
    out.push({ url: `${base}${directoryPath(s)}`, changeFrequency: "daily", priority: 0.9 });
    const opts = await repo.getFilterOptions(s);
    for (const st of opts.states.filter((x) => x.count >= MIN_LISTINGS_FOR_INDEXED_STATE_PAGE)) {
      out.push({ url: `${base}${directoryPath(s)}/${stateSlug(st.code)}`, changeFrequency: "weekly", priority: 0.7 });
    }
  }
  for (const c of await repo.listPublishedSlugs(45000)) {
    out.push({ url: `${base}/camps/${c.slug}`, lastModified: c.updatedAt ?? undefined, changeFrequency: "weekly", priority: 0.6 });
  }
  return out;
}
