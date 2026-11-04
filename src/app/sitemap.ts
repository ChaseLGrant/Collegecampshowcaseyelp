import type { MetadataRoute } from "next";
import { getPublicRepository } from "@/lib/data";
import { env } from "@/lib/env";
import { getHubIndex } from "@/lib/seo/hub-data";
import { cityHubs, collegeHubs, sportHubs, stateHubs } from "@/lib/seo/hubs";

export const revalidate = 3600;

/**
 * Only real, published, indexable pages: every public camp, the sport hubs, and the
 * state / city / college hubs that clear the thin-content thresholds (same rules the
 * pages use for their robots meta). No sample data, no filtered or search URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getPublicRepository();
  const base = env.siteUrl;
  const out: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/methodology`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/checklist`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/submit-camp`, changeFrequency: "monthly", priority: 0.3 },
  ];
  if (repo.mode !== "live") return out;
  const hubs = await getHubIndex();
  for (const h of sportHubs(hubs)) out.push({ url: `${base}${h.path}`, changeFrequency: "daily", priority: 0.9 });
  for (const h of stateHubs(hubs)) out.push({ url: `${base}${h.path}`, changeFrequency: "weekly", priority: 0.8 });
  for (const h of cityHubs(hubs)) out.push({ url: `${base}${h.path}`, changeFrequency: "weekly", priority: 0.7 });
  const colleges = collegeHubs(hubs, { indexableOnly: true });
  if (colleges.length) out.push({ url: `${base}/colleges`, changeFrequency: "weekly", priority: 0.6 });
  for (const h of colleges) out.push({ url: `${base}${h.path}`, changeFrequency: "weekly", priority: 0.7 });
  for (const c of await repo.listPublishedSlugs(45000)) {
    out.push({ url: `${base}/camps/${c.slug}`, lastModified: c.updatedAt ?? undefined, changeFrequency: "weekly", priority: 0.6 });
  }
  return out;
}
