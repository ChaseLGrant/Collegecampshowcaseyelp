import { timingSafeEqual } from "node:crypto";
import { makeIngestionStore, mapSourceRow } from "@/lib/admin/ingestion-store";
import { athleteMarketConfigured } from "@/lib/env";
import { runSource } from "@/lib/ingestion/pipeline";
import { STALE_AFTER_DAYS } from "@/lib/ingestion/staleness";
import { json } from "@/lib/server/http";
import { syncAthleteMarketAccount } from "@/lib/server/entitlement-sync";
import { getSql } from "@/lib/db";

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
  const db = getSql();
  if (!db) return json({ error: "Not configured" }, 503);
  const started = Date.now();
  const report: Record<string, unknown> = {};

  // 1) Due sources
  const due = await db`
    select * from sources where enabled and adapter <> 'manual' and (next_run_at is null or next_run_at <= now())
    order by next_run_at asc nulls first limit 20`;
  const store = makeIngestionStore(db);
  const runs: { source: string; status: string; queued: number }[] = [];
  for (const row of due) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const r = await runSource(mapSourceRow(row), store, { triggeredBy: "schedule" });
    runs.push({ source: row.name, status: r.status, queued: r.queued });
  }
  report.runs = runs;

  // 2) Flag listings not re-verified recently
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400_000).toISOString();
  const stale = await db`update camps set verification_status = 'stale' where verification_status = 'verified' and last_verified_at < ${cutoff} returning id`;
  report.markedStale = stale.length;

  // 3) Re-check linked Athlete Market accounts daily
  if (athleteMarketConfigured()) {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const links = await db<{ user_id: string; athlete_market_account_id: string }[]>`
      select user_id, athlete_market_account_id from athlete_market_links
      where status = 'active' and (last_synced_at is null or last_synced_at < ${dayAgo}) limit 200`;
    let synced = 0;
    for (const l of links) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try { await syncAthleteMarketAccount(db, l.user_id, l.athlete_market_account_id); synced++; } catch { /* retried next run */ }
    }
    report.athleteMarketSynced = synced;
  }
  return json({ ok: true, ...report });
}
