import "server-only";
import type { Sql } from "../db";
import { isUniqueViolation } from "../db";
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

/** Ingestion persistence. Writes only to runs, the discovery queue and source status — never to camps or reviews. */
export function makeIngestionStore(sql: Sql): IngestionStore {
  return {
    async startRun(sourceId, triggeredBy) {
      const [row] = await sql<{ id: string }[]>`insert into ingestion_runs (source_id, triggered_by) values (${sourceId}, ${triggeredBy}) returning id`;
      return row.id;
    },
    async finishRun(runId, r: RunResult) {
      await sql`
        update ingestion_runs set status = ${r.status}, finished_at = now(), items_found = ${r.found}, items_queued = ${r.queued},
          items_skipped = ${r.skipped}, error = ${r.error}, log = ${JSON.stringify(r.log.slice(0, 200))}::text::jsonb
        where id = ${runId}`;
    },
    async existingCamps(): Promise<ExistingCampRef[]> {
      const rows = await sql<any[]>`select id, name, sport, start_date, city, state, institution_name from camp_directory limit 20000`;
      return rows.map((r) => ({ id: r.id, name: r.name, sport: r.sport, startDate: r.start_date, city: r.city, state: r.state, institution: r.institution_name }));
    },
    async pendingFingerprints() {
      const rows = await sql<{ fingerprint: string }[]>`select fingerprint from discovery_queue where status = 'pending' limit 50000`;
      return new Set(rows.map((r) => r.fingerprint));
    },
    async enqueue(items: QueueInsert[]) {
      let n = 0;
      // ::text::jsonb — a bare ::jsonb cast makes postgres.js send the JSON text as a jsonb *string* scalar.
      // A pending item with the same fingerprint may appear concurrently: skip duplicates via the partial unique index.
      for (const i of items) {
        try {
          const res = await sql`
            insert into discovery_queue (kind, source_id, run_id, candidate, source_url, fingerprint, sport_confidence, matched_camp_id, duplicate_score, status, submitted_by)
            values (${i.kind}, ${i.sourceId}, ${i.runId}, ${JSON.stringify(i.candidate)}::text::jsonb, ${i.sourceUrl}, ${i.fingerprint},
                    ${i.sportConfidence}, ${i.matchedCampId}, ${i.duplicateScore}, ${i.status}, ${i.submittedBy ?? null})
            on conflict do nothing returning id`;
          n += res.length;
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
        }
      }
      return n;
    },
    async recordSourceOutcome(sourceId, ok, status) {
      const [row] = await sql<{ refresh_interval_hours: number; consecutive_failures: number }[]>`
        select refresh_interval_hours, consecutive_failures from sources where id = ${sourceId}`;
      const failures = ok ? 0 : (row?.consecutive_failures ?? 0) + 1;
      const now = new Date();
      await sql`
        update sources set last_run_at = ${now.toISOString()}, last_status = ${status}, consecutive_failures = ${failures},
          next_run_at = ${nextRunAt(now, row?.refresh_interval_hours ?? 168, failures).toISOString()}
        where id = ${sourceId}`;
    },
  };
}
