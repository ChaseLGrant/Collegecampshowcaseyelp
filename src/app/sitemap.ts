import type { MetadataRoute } from "next";
import { getPublicRepository } from "@/lib/data";
import { env } from "@/lib/env";
import { getHubIndex } from "@/lib/seo/hub-data";
import { DIRECTORY_SPORTS, directoryPath } from "@/lib/sports";
import { campsInScope, citySlug, cityHubs, collegeHubs, stateHubs, type HubIndex, type HubScope } from "@/lib/seo/hubs";
import { latestUpdate } from "@/lib/seo/sitemap-dates";

export const revalidate = 3600;

/**
 * Only real, published, indexable pages: every public camp, the sport hubs, and the
 * state / city / college hubs that clear the thin-content thresholds (same rules the
 * pages use for their robots meta). No sample data, no filtered or search URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getPublicRepository();
  const base = env.siteUrl;
  const statics: MetadataRoute.Sitemap = [
    { url: `${base}/methodology`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/checklist`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/submit-camp`, changeFrequency: "monthly", priority: 0.3 },
  ];
  if (repo.mode !== "live") return [{ url: `${base}/`, changeFrequency: "daily", priority: 1 }, ...statics];

  const [hubs, slugs] = await Promise.all([getHubIndex(), repo.listPublishedSlugs(45000)]);
  // lastmod for a hub = the most recent update to any listing it shows (real DB timestamps only).
  const updated = new Map(slugs.map((c) => [c.slug, c.updatedAt]));
  const lastmod = (scope: HubScope, idx: HubIndex = hubs) => latestUpdate(campsInScope(idx, scope).map((c) => updated.get(c.slug)));

  const out: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: latestUpdate(slugs.map((c) => c.updatedAt)), changeFrequency: "daily", priority: 1 },
    ...statics,
  ];
  for (const sport of DIRECTORY_SPORTS) out.push({ url: `${base}${directoryPath(sport)}`, lastModified: lastmod({ sport }), changeFrequency: "daily", priority: 0.9 });
  for (const h of stateHubs(hubs)) out.push({ url: `${base}${h.path}`, lastModified: lastmod({ sport: h.sport, state: h.state }), changeFrequency: "weekly", priority: 0.8 });
  for (const h of cityHubs(hubs)) out.push({ url: `${base}${h.path}`, lastModified: lastmod({ sport: h.sport, state: h.state, city: citySlug(h.city) }), changeFrequency: "weekly", priority: 0.7 });
  const colleges = collegeHubs(hubs, { indexableOnly: true });
  if (colleges.length) {
    out.push({ url: `${base}/colleges`, lastModified: latestUpdate(colleges.flatMap((c) => campsInScope(hubs, { college: c.slug }).map((x) => updated.get(x.slug)))), changeFrequency: "weekly", priority: 0.6 });
  }
  for (const h of colleges) out.push({ url: `${base}${h.path}`, lastModified: lastmod({ college: h.slug }), changeFrequency: "weekly", priority: 0.7 });
  for (const c of slugs) {
    out.push({ url: `${base}/camps/${c.slug}`, lastModified: c.updatedAt ?? undefined, changeFrequency: "weekly", priority: 0.6 });
  }
  // A single sitemap file holds up to 50,000 URLs; at ~320 today there is no need for a sitemap index yet.
  return out;
}
