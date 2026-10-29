import "server-only";
import { demoDataEnabled } from "../env";
import { getPublicSupabase, getServerSupabase } from "../supabase/server";
import type { CampRepository } from "./repository";
import { emptyRepository, sampleRepository } from "./sample-repo";
import { makeSupabaseRepository } from "./supabase-repo";

/** Public, cookie-free repository (cacheable pages: directories, sitemap). */
export function getPublicRepository(): CampRepository {
  const db = getPublicSupabase();
  if (db) return makeSupabaseRepository(db);
  return demoDataEnabled() ? sampleRepository : emptyRepository;
}

/** Repository acting as the current visitor (needed for tier-gated research via RLS). */
export async function getVisitorRepository(): Promise<CampRepository> {
  const db = await getServerSupabase();
  if (db) return makeSupabaseRepository(db);
  return demoDataEnabled() ? sampleRepository : emptyRepository;
}

export type { CampRepository } from "./repository";
