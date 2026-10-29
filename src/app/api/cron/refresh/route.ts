import { timingSafeEqual } from "node:crypto";
import { makeIngestionStore, mapSourceRow } from "@/lib/admin/ingestion-store";
import { athleteMarketConfigured } from "@/lib/env";
import { runSource } from "@/lib/ingestion/pipeline";
import { STALE_AFTER_DAYS } from "@/lib/ingestion/staleness";
import { json } from "@/lib/server/http";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";
import { getServiceSupabase } from "@/lib/supabase/server";

export const maxDuration = 300;
const TIME_BUDGET_MS = 240_000;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Scheduled refresh (Vercel Cron). Runs due sources, flags stale listings, re-syncs bundled entitlements. */
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  const db = getServiceSupabase();
  if (!db) return json({ error: "Not configured" }, 503);
  const started = Date.now();
  const report: Record<string, unknown> = {};

  // 1) Due sources
  const { data: due } = await db.from("sources").select("*").eq("enabled", true).neq("adapter", "manual")
    .or(`next_run_at.is.null,next_run_at.lte.${new Date().toISOString()}`).order("next_run_at", { ascending: true, nullsFirst: true }).limit(20);
  const store = makeIngestionStore(db);
  const runs: { source: string; status: string; queued: number }[] = [];
  for (const row of due ?? []) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const r = await runSource(mapSourceRow(row), store, { triggeredBy: "schedule" });
    runs.push({ source: row.name, status: r.status, queued: r.queued });
  }
  report.runs = runs;

  // 2) Flag listings not re-verified recently
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400_000).toISOString();
  const { data: stale } = await db.from("camps").update({ verification_status: "stale" })
    .eq("verification_status", "verified").lt("last_verified_at", cutoff).select("id");
  report.markedStale = stale?.length ?? 0;

  // 3) Re-check linked Athlete Market accounts daily
  if (athleteMarketConfigured()) {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const { data: links } = await db.from("athlete_market_links").select("user_id,athlete_market_account_id")
      .eq("status", "active").or(`last_synced_at.is.null,last_synced_at.lt.${dayAgo}`).limit(200);
    let synced = 0;
    for (const l of links ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try { await syncAthleteMarketAccount(db, l.user_id, l.athlete_market_account_id); synced++; } catch { /* retried next run */ }
    }
    report.athleteMarketSynced = synced;
  }
  return json({ ok: true, ...report });
}
