import { runSourceNow, saveSource } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format";
import { ingestionPolicy } from "@/lib/ingestion/policy";
import { mapSourceRow } from "@/lib/admin/ingestion-store";
import { requireStaff } from "@/lib/server/auth";

const RIGHTS = [
  ["unknown", "Unknown — not reviewed (blocks ingestion)"],
  ["facts_only", "Facts only (event facts; no copied text)"],
  ["link_only", "Link only (show source name + link)"],
  ["licensed_display", "Licensed: display ratings"],
  ["licensed_excerpt", "Licensed: display ratings + excerpts"],
  ["prohibited", "Prohibited (do not use)"],
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function SourceForm({ s }: { s?: any }) {
  return (
    <form action={saveSource} className="grid gap-2 text-sm sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div><label className="label">Name</label><input name="name" required defaultValue={s?.name} className="input" /></div>
      <div><label className="label">Kind</label>
        <select name="kind" defaultValue={s?.kind ?? "college_site"} className="input">
          {["college_site", "camp_calendar", "organizer_site", "showcase_site", "licensed_provider", "feed", "api", "csv", "review_platform", "editorial"].map((k) => <option key={k}>{k}</option>)}
        </select></div>
      <div><label className="label">Adapter</label>
        <select name="adapter" defaultValue={s?.adapter ?? "schema_org"} className="input">
          <option value="schema_org">schema.org JSON-LD events on web pages</option><option value="ical">iCalendar feed</option>
          <option value="json_feed">JSON feed / licensed API</option><option value="csv">CSV (URL or upload)</option>
        </select></div>
      <div><label className="label">Base URL</label><input name="base_url" type="url" defaultValue={s?.base_url ?? ""} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">Content rights</label>
        <select name="content_rights" defaultValue={s?.content_rights ?? "unknown"} className="input">{RIGHTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label">Terms / license notes</label><textarea name="terms_notes" defaultValue={s?.terms_notes ?? ""} className="input" placeholder="What the site's terms allow, robots.txt notes, contact with provider…" /></div>
      <div><label className="label">License reference</label><input name="license_reference" defaultValue={s?.license_reference ?? ""} className="input" placeholder="Contract ID or URL" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Requests/min</label><input name="rate_limit_per_minute" type="number" min={1} max={60} defaultValue={s?.rate_limit_per_minute ?? 6} className="input" /></div>
        <div><label className="label">Refresh (hours)</label><input name="refresh_interval_hours" type="number" min={1} defaultValue={s?.refresh_interval_hours ?? 168} className="input" /></div>
      </div>
      <div className="sm:col-span-2"><label className="label">Adapter config (JSON)</label>
        <textarea name="config" defaultValue={JSON.stringify(s?.config ?? {}, null, 2)} className="input font-mono text-xs" rows={4} placeholder='{"urls": ["https://example.edu/camps"], "defaults": {"sport": "baseball", "institution": "Example University"}}' />
        <p className="mt-1 text-xs muted">Never put API keys here. For licensed APIs use <code>{`"authEnv": "PROVIDER_API_KEY"`}</code> and set that env var on the server.</p></div>
      <label className="flex items-center gap-2"><input type="checkbox" name="terms_reviewed" defaultChecked={!!s?.terms_reviewed_at} /> I reviewed this source&apos;s terms and robots.txt</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={s?.enabled} /> Enabled for scheduled refresh</label>
      <button className="btn-primary sm:col-span-2">{s ? "Save source" : "Add source"}</button>
    </form>
  );
}

export default async function SourcesPage() {
  const { db } = await requireStaff("admin");
  const { data } = await db.from("sources").select("*").order("created_at", { ascending: false });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Source registry</h1>
      <p className="text-sm muted">Every source must have its terms reviewed and content rights set before it can run. Scheduled runs respect robots.txt, crawl-delay and the rate limit, and stop on logins, paywalls or bot protection.</p>
      {(data ?? []).map((s) => {
        const policy = ingestionPolicy(mapSourceRow(s), { manualTrigger: true });
        return (
          <details key={s.id} className="card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{s.name}</span>
              <span className="tag bg-navy-50">{s.kind} · {s.adapter}</span>
              <span className={`tag ${s.content_rights === "unknown" || s.content_rights === "prohibited" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>rights: {s.content_rights}</span>
              {s.enabled ? <span className="tag bg-brand-50 text-brand">enabled</span> : <span className="tag bg-navy-50">disabled</span>}
              <span className="text-xs muted">last run {s.last_run_at ? `${formatDate(s.last_run_at)} (${s.last_status})` : "never"}{s.consecutive_failures ? ` · ${s.consecutive_failures} failures` : ""}{s.next_run_at ? ` · next ${formatDate(s.next_run_at)}` : ""}</span>
            </summary>
            <div className="mt-4 space-y-4">
              {s.adapter !== "manual" && (
                <form action={runSourceNow} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-secondary py-1.5" disabled={!policy.allowed}>Run now</button>
                  {!policy.allowed && <span className="text-xs text-amber-900">{policy.reason}</span>}
                </form>
              )}
              {s.adapter !== "manual" && <SourceForm s={s} />}
            </div>
          </details>
        );
      })}
      <div className="card p-4"><p className="mb-3 font-semibold">Add a source</p><SourceForm /></div>
    </div>
  );
}
