import { ADAPTERS } from "./adapters";
import { candidateFingerprint, DUPLICATE_THRESHOLD, findBestMatch, type ExistingCampRef } from "./dedupe";
import { PoliteFetcher } from "./fetcher";
import { normalizeCandidate } from "./normalize";
import { ingestionPolicy } from "./policy";
import type { AdapterContext, FetchLike, NormalizedCandidate, RawCandidate, SourceRecord } from "./types";

export interface QueueInsert {
  kind: "camp" | "camp_update";
  sourceId: string | null;
  runId: string | null;
  candidate: NormalizedCandidate;
  sourceUrl: string | null;
  fingerprint: string;
  sportConfidence: number;
  matchedCampId: string | null;
  duplicateScore: number | null;
  status: "pending" | "duplicate";
  submittedBy?: string | null;
}

/** Storage operations the pipeline needs. Implemented with Supabase in src/lib/admin/ingestion-store.ts. */
export interface IngestionStore {
  startRun(sourceId: string | null, triggeredBy: "schedule" | "admin" | "csv" | "submission"): Promise<string>;
  finishRun(runId: string, r: RunResult): Promise<void>;
  existingCamps(): Promise<ExistingCampRef[]>;
  pendingFingerprints(): Promise<Set<string>>;
  enqueue(items: QueueInsert[]): Promise<number>;
  recordSourceOutcome(sourceId: string, ok: boolean, status: string): Promise<void>;
}

export interface RunResult {
  status: "succeeded" | "partial" | "failed" | "blocked";
  found: number;
  queued: number;
  skipped: number;
  error: string | null;
  log: string[];
}

/**
 * Turns raw candidates into queue items. Pure — no I/O — so it is unit tested.
 * Nothing is published here: every item waits for admin approval.
 */
export function prepareQueueItems(raw: RawCandidate[], opts: {
  sourceId: string | null; runId: string | null; fallbackUrl: string | null;
  existing: ExistingCampRef[]; pendingFingerprints: Set<string>; submittedBy?: string | null;
}): { items: QueueInsert[]; skipped: number; notes: string[] } {
  const items: QueueInsert[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of raw) {
    const c = normalizeCandidate(r, opts.fallbackUrl);
    if (!c) { skipped++; notes.push("Skipped item with no name"); continue; }
    if (!c.sourceUrl) { skipped++; notes.push(`Skipped "${c.name}": no source URL for attribution`); continue; }
    const fp = candidateFingerprint(c);
    if (seen.has(fp) || opts.pendingFingerprints.has(fp)) { skipped++; continue; }
    seen.add(fp);
    const match = findBestMatch(c, opts.existing);
    const isDup = !!match && match.score >= DUPLICATE_THRESHOLD;
    items.push({
      kind: isDup ? "camp_update" : "camp",
      sourceId: opts.sourceId,
      runId: opts.runId,
      candidate: c,
      sourceUrl: c.sourceUrl,
      fingerprint: fp,
      sportConfidence: c.sportConfidence,
      matchedCampId: match?.camp.id ?? null,
      duplicateScore: match?.score ?? null,
      status: "pending",
      submittedBy: opts.submittedBy ?? null,
    });
  }
  return { items, skipped, notes };
}

export async function runSource(source: SourceRecord, store: IngestionStore, opts: {
  triggeredBy: "schedule" | "admin" | "csv";
  inlineContent?: string;
  fetcher?: FetchLike;
}): Promise<RunResult> {
  const log: string[] = [];
  const policy = ingestionPolicy(source, { manualTrigger: opts.triggeredBy !== "schedule" });
  const runId = await store.startRun(source.id, opts.triggeredBy);
  if (!policy.allowed) {
    const r: RunResult = { status: "blocked", found: 0, queued: 0, skipped: 0, error: policy.reason, log: [policy.reason] };
    await store.finishRun(runId, r);
    return r;
  }
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) {
    const r: RunResult = { status: "failed", found: 0, queued: 0, skipped: 0, error: "No adapter", log };
    await store.finishRun(runId, r);
    return r;
  }
  const ctx: AdapterContext = {
    fetcher: opts.fetcher ?? new PoliteFetcher({ respectRobots: source.respectsRobots, requestsPerMinute: source.rateLimitPerMinute }),
    log: (m) => log.push(m),
    inlineContent: opts.inlineContent,
  };
  let result: RunResult;
  try {
    const raw = await adapter.discover(source, ctx);
    const [existing, pending] = await Promise.all([store.existingCamps(), store.pendingFingerprints()]);
    const { items, skipped, notes } = prepareQueueItems(raw, {
      sourceId: source.id, runId, fallbackUrl: source.baseUrl, existing, pendingFingerprints: pending,
    });
    log.push(...notes.slice(0, 50));
    const queued = items.length ? await store.enqueue(items) : 0;
    result = { status: skipped && !queued && raw.length ? "partial" : "succeeded", found: raw.length, queued, skipped, error: null, log };
  } catch (e) {
    const msg = (e as Error).message;
    result = { status: /^Blocked|robots|restricted|bot-protection|login/i.test(msg) ? "blocked" : "failed", found: 0, queued: 0, skipped: 0, error: msg, log };
  }
  await store.finishRun(runId, result);
  if (opts.triggeredBy !== "csv") await store.recordSourceOutcome(source.id, result.status === "succeeded" || result.status === "partial", result.status);
  return result;
}
