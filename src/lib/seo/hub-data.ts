import "server-only";
import { cache } from "react";
import { getPublicRepository } from "../data";
import { todayISO } from "../search";
import { buildHubIndex, type HubIndex } from "./hubs";

/** One read of all public listings per request, shared by hub pages, related camps, footer and sitemap. */
export const getHubIndex = cache(async (): Promise<HubIndex> => {
  const repo = await getPublicRepository();
  if (repo.mode !== "live") return buildHubIndex([], todayISO());
  return buildHubIndex(await repo.listPublicCamps(5000), todayISO());
});
