import "server-only";
import { getSql } from "../db";
import { demoDataEnabled } from "../env";
import { makePgRepository } from "./pg-repo";
import type { CampRepository } from "./repository";
import { emptyRepository, sampleRepository } from "./sample-repo";

// Whether the database has any published camps yet (cached briefly per server instance).
let liveCheck: { at: number; hasCamps: boolean } | null = null;
const LIVE_CHECK_MS = 60_000;

async function databaseHasCamps(): Promise<boolean> {
  const sql = getSql()!;
  if (liveCheck && Date.now() - liveCheck.at < LIVE_CHECK_MS) return liveCheck.hasCamps;
  const [row] = await sql<{ has: boolean }[]>`select exists (select 1 from camps where status = 'published') as has`;
  liveCheck = { at: Date.now(), hasCamps: row.has };
  return row.has;
}

/**
 * Public repository. Reads Postgres whenever DATABASE_URL is set. While the database
 * has no published camps and CAMPGRADE_DEMO_DATA=true, the clearly labeled sample
 * listings are shown instead so the site is never empty; real camps replace them
 * automatically once the first one is published.
 */
export async function getPublicRepository(): Promise<CampRepository> {
  const sql = getSql();
  if (!sql) return demoDataEnabled() ? sampleRepository : emptyRepository;
  if (!demoDataEnabled()) return makePgRepository(sql);
  try {
    return (await databaseHasCamps()) ? makePgRepository(sql) : sampleRepository;
  } catch (e) {
    console.error("Database unavailable, showing sample data:", (e as Error).message);
    return sampleRepository;
  }
}

/** Same data as the public repository; research tier is passed explicitly by callers. */
export async function getVisitorRepository(): Promise<CampRepository> {
  return getPublicRepository();
}

export type { CampRepository } from "./repository";
