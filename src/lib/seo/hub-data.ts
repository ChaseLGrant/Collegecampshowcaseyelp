import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getPublicRepository } from "../data";
import { todayISO } from "../search";
import { buildHubIndex, type HubIndex } from "./hubs";

/** Tag for the cross-request hub index cache. /api/cron/refresh revalidates it after ingesting. */
export const HUBS_TAG = "hubs";

/**
 * All public listings, read once and shared across requests for up to an hour (it was rebuilt on
 * every request before: up to 5,000 rows plus buildHubIndex in JS — the main CPU cost on Vercel).
 * Admin edits and the daily refresh show up within the hour, or immediately via revalidateTag("hubs").
 */
const getHubIndexCached = unstable_cache(
  async (): Promise<HubIndex> => {
    const repo = await getPublicRepository();
    if (repo.mode !== "live") return buildHubIndex([], todayISO());
    return buildHubIndex(await repo.listPublicCamps(5000), todayISO());
  },
  ["hub-index-v1"],
  { revalidate: 3600, tags: [HUBS_TAG] },
);

/** Hub index shared by hub pages, related camps, footer and sitemap (deduped per request too). */
export const getHubIndex = cache(async (): Promise<HubIndex> => getHubIndexCached());
