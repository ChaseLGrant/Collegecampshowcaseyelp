import { describe, expect, it } from "vitest";
import { classifyEventType, classifySport, normalizeCandidate, parseDate, parsePrice } from "@/lib/ingestion/normalize";
import { candidateFingerprint, duplicateScore } from "@/lib/ingestion/dedupe";
import { extractJsonLdEvents } from "@/lib/ingestion/adapters/schema-org";
import { parseIcs } from "@/lib/ingestion/adapters/ical";
import { mapJsonItems } from "@/lib/ingestion/adapters/json-feed";
import { csvRowsToCandidates } from "@/lib/ingestion/adapters/csv";
import { csvCell, parseCsv } from "@/lib/ingestion/csv";
import { ingestionPolicy } from "@/lib/ingestion/policy";
import { prepareQueueItems, runSource, type IngestionStore, type QueueInsert } from "@/lib/ingestion/pipeline";
import { nextRunAt, verificationStatusFor } from "@/lib/ingestion/staleness";
import type { SourceRecord } from "@/lib/ingestion/types";

describe("normalization", () => {
  it("classifies sports and prefers softball when both appear", () => {
    expect(classifySport(null, "Summer Baseball Prospect Camp").sport).toBe("baseball");
    expect(classifySport(null, "Fastpitch softball camp at the baseball complex").sport).toBe("softball");
    expect(classifySport("Football", "").confidence).toBe(1);
    expect(classifySport(null, "Youth camp").sport).toBe("other");
  });
  it("classifies event types", () => {
    expect(classifyEventType(null, "Fall Prospect Camp")).toBe("prospect_camp");
    expect(classifyEventType("showcase", "")).toBe("showcase");
    expect(classifyEventType(null, "Goalkeeper ID Camp")).toBe("id_camp");
  });
  it("parses prices without inventing them", () => {
    expect(parsePrice("$195")).toEqual({ cents: 19500, notes: null });
    expect(parsePrice("Free")).toEqual({ cents: 0, notes: null });
    expect(parsePrice("$150 day / $250 overnight").cents).toBe(15000);
    expect(parsePrice("Contact us")).toEqual({ cents: null, notes: "Contact us" });
    expect(parsePrice(null)).toEqual({ cents: null, notes: null });
  });
  it("parses common date formats and rejects impossible dates", () => {
    expect(parseDate("2026-06-15T09:00:00-05:00")).toBe("2026-06-15");
    expect(parseDate("20260615")).toBe("2026-06-15");
    expect(parseDate("June 15, 2026")).toBe("2026-06-15");
    expect(parseDate("Sept 3rd, 2026")).toBe("2026-09-03");
    expect(parseDate("6/15/2026")).toBe("2026-06-15");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });
  it("leaves missing facts empty and lists them", () => {
    const c = normalizeCandidate({ name: "Mystery Camp", sourceUrl: "https://x.edu/c" })!;
    expect(c.startDate).toBeNull();
    expect(c.priceCents).toBeNull();
    expect(c.state).toBeNull();
    expect(c.missingFields).toEqual(expect.arrayContaining(["startDate", "state", "registrationUrl", "price"]));
  });
  it("strips HTML and blocks unsafe URLs", () => {
    const c = normalizeCandidate({ name: "<b>Camp</b>", description: "<script>x()</script>Fun &amp; games", registrationUrl: "javascript:alert(1)" })!;
    expect(c.name).toBe("Camp");
    expect(c.description).toBe("Fun & games");
    expect(c.registrationUrl).toBeNull();
  });
});

describe("dedupe", () => {
  const base = normalizeCandidate({ name: "Sample State Baseball Prospect Camp", sport: "baseball", startDate: "2026-06-15", state: "TX", city: "Austin", sourceUrl: "https://a.edu" })!;
  it("produces the same fingerprint for the same event from different sources", () => {
    const other = normalizeCandidate({ name: "Prospect Camp — Sample State Baseball 2026", sport: "baseball", startDate: "June 15, 2026", state: "Texas", sourceUrl: "https://b.com" })!;
    expect(candidateFingerprint(other)).toBe(candidateFingerprint(base));
  });
  it("scores likely duplicates high and different events low", () => {
    const existing = { id: "1", name: "Sample State Baseball Prospect Camp", sport: "baseball", startDate: "2026-06-15", city: "Austin", state: "TX", institution: null };
    expect(duplicateScore(base, existing)).toBeGreaterThanOrEqual(0.7);
    expect(duplicateScore(base, { ...existing, sport: "softball" })).toBe(0);
    expect(duplicateScore(base, { ...existing, name: "Lakeside Hitting Clinic", startDate: "2026-08-01" })).toBeLessThan(0.5);
  });
});

describe("adapters", () => {
  it("extracts schema.org events from JSON-LD, including @graph", () => {
    const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SportsEvent","name":"Elite Soccer ID Camp","startDate":"2026-07-10","endDate":"2026-07-11","location":{"@type":"Place","name":"Main Field","address":{"addressLocality":"Durham","addressRegion":"NC"}},"offers":{"price":"225","url":"https://reg.example.com/1"},"organizer":{"name":"Example University Soccer"}}]}</script><script type="application/ld+json">{bad json</script></html>`;
    const ev = extractJsonLdEvents(html, "https://example.edu/camps");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ name: "Elite Soccer ID Camp", city: "Durham", state: "NC", price: "225", registrationUrl: "https://reg.example.com/1", sourceUrl: "https://example.edu/camps" });
  });
  it("parses iCal feeds with folded lines and exclusive all-day DTEND", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Volleyball Prospect\r\n  Clinic\r\nDTSTART;VALUE=DATE:20260801\r\nDTEND;VALUE=DATE:20260803\r\nLOCATION:Arena\\, Columbus, OH\r\nURL:https://ex.edu/vb\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const [e] = parseIcs(ics, "https://ex.edu/cal.ics");
    expect(e.name).toBe("Volleyball Prospect Clinic");
    expect(e.endDate).toBe("2026-08-02");
    expect(e.state).toBe("OH");
  });
  it("maps licensed JSON feeds via field paths", () => {
    const items = mapJsonItems({ data: { events: [{ title: "Combine", when: { start: "2026-05-01" }, link: "https://p.com/e/1" }] } },
      { itemsPath: "data.events", fields: { name: "title", startDate: "when.start", sourceUrl: "link" } }, "https://p.com/api");
    expect(items[0]).toEqual({ name: "Combine", startDate: "2026-05-01", sourceUrl: "https://p.com/e/1" });
  });
  it("requires a source_url column for CSV imports", () => {
    expect(csvRowsToCandidates("name\nCamp A").errors.length).toBeGreaterThan(0);
    const ok = csvRowsToCandidates('name,sport,source_url,participating_colleges\n"Camp, A",baseball,https://x.edu,"Rice; Baylor"');
    expect(ok.errors).toEqual([]);
    expect(ok.candidates[0].participatingColleges).toEqual(["Rice", "Baylor"]);
  });
  it("parses quoted CSV and neutralizes formula injection on export", () => {
    const { rows } = parseCsv('a,b\r\n"x ""y""","1\n2"\r\n');
    expect(rows[0]).toEqual({ a: 'x "y"', b: "1\n2" });
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
  });
});

const source = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "s1", name: "Test", kind: "college_site", adapter: "csv", baseUrl: "https://x.edu", config: {},
  contentRights: "facts_only", respectsRobots: true, rateLimitPerMinute: 6, enabled: true, termsReviewedAt: "2026-01-01", ...over,
});

describe("ingestion policy", () => {
  it("blocks sources whose rights or terms haven't been reviewed", () => {
    expect(ingestionPolicy(source({ contentRights: "unknown" })).allowed).toBe(false);
    expect(ingestionPolicy(source({ contentRights: "prohibited" })).allowed).toBe(false);
    expect(ingestionPolicy(source({ termsReviewedAt: null })).allowed).toBe(false);
    expect(ingestionPolicy(source({ adapter: "schema_org", respectsRobots: false })).allowed).toBe(false);
    expect(ingestionPolicy(source({ enabled: false })).allowed).toBe(false);
    expect(ingestionPolicy(source({ enabled: false }), { manualTrigger: true }).allowed).toBe(true);
    expect(ingestionPolicy(source()).allowed).toBe(true);
  });
});

describe("pipeline", () => {
  it("queues candidates for approval, flags duplicates and skips unattributed items", () => {
    const { items, skipped } = prepareQueueItems([
      { name: "New Camp", sport: "baseball", sourceUrl: "https://a.edu" },
      { name: "New Camp", sport: "baseball", sourceUrl: "https://a.edu" }, // same batch duplicate
      { name: "No Source Camp" },
      { name: "Existing Showcase", sport: "baseball", startDate: "2026-06-01", state: "TX", sourceUrl: "https://b.com" },
    ], {
      sourceId: "s1", runId: "r1", fallbackUrl: null, pendingFingerprints: new Set(),
      existing: [{ id: "c9", name: "Existing Showcase", sport: "baseball", startDate: "2026-06-01", city: null, state: "TX", institution: null }],
    });
    expect(items.map((i) => i.kind)).toEqual(["camp", "camp_update"]);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(items[1].matchedCampId).toBe("c9");
    expect(skipped).toBe(2);
  });

  function memoryStore() {
    const queued: QueueInsert[] = [];
    const runs: { status: string }[] = [];
    const store: IngestionStore = {
      startRun: async () => "run1",
      finishRun: async (_id, r) => { runs.push(r); },
      existingCamps: async () => [],
      pendingFingerprints: async () => new Set(),
      enqueue: async (items) => { queued.push(...items); return items.length; },
      recordSourceOutcome: async () => {},
    };
    return { store, queued, runs };
  }

  it("runs a CSV source end to end into the queue", async () => {
    const { store, queued, runs } = memoryStore();
    const r = await runSource(source(), store, { triggeredBy: "csv", inlineContent: "name,sport,source_url\nFall ID Camp,soccer,https://x.edu/c" });
    expect(r.status).toBe("succeeded");
    expect(queued).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
  });
  it("records a blocked run without fetching when policy fails", async () => {
    const { store, queued } = memoryStore();
    const r = await runSource(source({ contentRights: "unknown" }), store, { triggeredBy: "admin" });
    expect(r.status).toBe("blocked");
    expect(queued).toHaveLength(0);
  });
  it("marks robots-blocked web sources as blocked", async () => {
    const { store } = memoryStore();
    const fetcher = { getText: async () => ({ ok: false as const, reason: "disallowed by robots.txt", blocked: true }) };
    const r = await runSource(source({ adapter: "schema_org" }), store, { triggeredBy: "admin", fetcher });
    expect(r.status).toBe("blocked");
  });
});

describe("staleness", () => {
  it("flags old verifications as stale", () => {
    const now = new Date("2026-10-01");
    expect(verificationStatusFor(null, now)).toBe("unverified");
    expect(verificationStatusFor("2026-09-20", now)).toBe("verified");
    expect(verificationStatusFor("2026-06-01", now)).toBe("stale");
  });
  it("backs off after failures", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(nextRunAt(t, 24, 0).getTime() - t.getTime()).toBe(24 * 3600000);
    expect(nextRunAt(t, 24, 2).getTime() - t.getTime()).toBe(96 * 3600000);
    expect(nextRunAt(t, 168, 5).getTime() - t.getTime()).toBe(168 * 3600000);
  });
});
