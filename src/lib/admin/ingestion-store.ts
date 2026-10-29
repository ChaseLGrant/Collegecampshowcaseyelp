import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingCampRef } from "../ingestion/dedupe";
import type { IngestionStore, QueueInsert, RunResult } from "../ingestion/pipeline";
import { nextRunAt } from "../ingestion/staleness";
import type { SourceRecord } from "../ingestion/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapSourceRow(r: any): SourceRecord & { refreshIntervalHours: number; consecutiveFailures: number } {
  return {
    id: r.id, name: r.name, kind: r.kind, adapter: r.adapter, baseUrl: r.base_url, config: r.config ?? {},
    contentRights: r.content_rights, respectsRobots: r.respects_robots, rateLimitPerMinute: r.rate_limit_per_minute,
    enabled: r.enabled, termsReviewedAt: r.terms_reviewed_at,
    refreshIntervalHours: r.refresh_interval_hours, consecutiveFailures: r.consecutive_failures,
  };
}

export function makeIngestionStore(db: SupabaseClient): IngestionStore {
  return {
    async startRun(sourceId, triggeredBy) {
      const { data, error } = await db.from("ingestion_runs").insert({ source_id: sourceId, triggered_by: triggeredBy }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id;
    },
    async finishRun(runId, r: RunResult) {
      await db.from("ingestion_runs").update({
        status: r.status, finished_at: new Date().toISOString(), items_found: r.found, items_queued: r.queued,
        items_skipped: r.skipped, error: r.error, log: r.log.slice(0, 200),
      }).eq("id", runId);
    },
    async existingCamps(): Promise<ExistingCampRef[]> {
      const { data } = await db.from("camp_directory").select("id,name,sport,start_date,city,state,institution_name").limit(20000);
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, sport: r.sport, startDate: r.start_date, city: r.city, state: r.state, institution: r.institution_name }));
    },
    async pendingFingerprints() {
      const { data } = await db.from("discovery_queue").select("fingerprint").eq("status", "pending").limit(50000);
      return new Set((data ?? []).map((r: any) => r.fingerprint));
    },
    async enqueue(items: QueueInsert[]) {
      const rows = items.map((i) => ({
        kind: i.kind, source_id: i.sourceId, run_id: i.runId, candidate: i.candidate, source_url: i.sourceUrl,
        fingerprint: i.fingerprint, sport_confidence: i.sportConfidence, matched_camp_id: i.matchedCampId,
        duplicate_score: i.duplicateScore, status: i.status, submitted_by: i.submittedBy ?? null,
      }));
      let n = 0;
      for (let k = 0; k < rows.length; k += 500) {
        const batch = rows.slice(k, k + 500);
        const { data, error } = await db.from("discovery_queue").insert(batch).select("id");
        if (!error) { n += data?.length ?? 0; continue; }
        if (error.code !== "23505") throw new Error(error.message);
        // A pending item with the same fingerprint appeared concurrently: insert one by one, skipping duplicates.
        for (const row of batch) {
          const r = await db.from("discovery_queue").insert(row);
          if (!r.error) n++;
          else if (r.error.code !== "23505") throw new Error(r.error.message);
        }
      }
      return n;
    },
    async recordSourceOutcome(sourceId, ok, status) {
      const { data } = await db.from("sources").select("refresh_interval_hours,consecutive_failures").eq("id", sourceId).single();
      const failures = ok ? 0 : (data?.consecutive_failures ?? 0) + 1;
      const now = new Date();
      await db.from("sources").update({
        last_run_at: now.toISOString(), last_status: status, consecutive_failures: failures,
        next_run_at: nextRunAt(now, data?.refresh_interval_hours ?? 168, failures).toISOString(),
      }).eq("id", sourceId);
    },
  };
}
