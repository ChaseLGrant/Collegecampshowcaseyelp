import Link from "next/link";
import { addManualCandidate, approveQueue, rejectQueue } from "@/lib/actions/admin";
import { formatDateRange, formatPrice } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import { EVENT_TYPES, SPORTS } from "@/lib/sports";
import type { NormalizedCandidate } from "@/lib/ingestion/types";

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { db } = await requireStaff("admin");
  const status = (await searchParams).status === "reviewed" ? "reviewed" : "pending";
  let q = db.from("discovery_queue").select("*, sources(name, content_rights), camps:matched_camp_id(name, slug)").order("created_at", { ascending: false }).limit(100);
  q = status === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
  const { data } = await q;
  type Row = { id: string; kind: string; candidate: NormalizedCandidate; source_url: string | null; sport_confidence: number | null; duplicate_score: number | null; status: string; created_at: string; sources: { name: string; content_rights: string } | null; camps: { name: string; slug: string } | null };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Discovery queue</h1>
        <div className="flex gap-2 text-sm"><Link href="/admin/discovery" className={status === "pending" ? "chip-on py-1" : "chip-off py-1"}>Pending</Link><Link href="/admin/discovery?status=reviewed" className={status === "reviewed" ? "chip-on py-1" : "chip-off py-1"}>Reviewed</Link></div>
      </div>
      <p className="text-sm muted">Nothing is published until approved here. Check each item against its source. Low sport confidence or a likely duplicate is highlighted.</p>
      {((data ?? []) as unknown as Row[]).map((r) => {
        const c = r.candidate;
        return (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{c.name}</span>
              <span className="tag bg-navy-50">{r.kind === "camp_update" ? "Update to existing" : "New"}</span>
              {r.sources && <span className="tag bg-navy-50">{r.sources.name} · rights: {r.sources.content_rights}</span>}
              {(r.sport_confidence ?? 1) < 0.7 && <span className="tag bg-amber-50 text-amber-900">Sport uncertain ({r.sport_confidence})</span>}
              {r.duplicate_score != null && <span className="tag bg-amber-50 text-amber-900">Possible duplicate of {r.camps?.name ?? "existing"} ({r.duplicate_score})</span>}
              {r.status !== "pending" && <span className="tag bg-navy-50">{r.status}</span>}
            </div>
            <p className="mt-1 muted">{c.sport} · {c.eventType} · {[c.institution, c.organizer].filter(Boolean).join(" / ") || "no host"} · {[c.city, c.state].filter(Boolean).join(", ") || "no location"} · {formatDateRange(c.startDate, c.endDate)} · {formatPrice(c.priceCents, c.priceNotes)}</p>
            {c.missingFields.length > 0 && <p className="mt-1 text-xs text-amber-900">Missing: {c.missingFields.join(", ")} (left blank — never guessed)</p>}
            {c.participatingColleges.length > 0 && <p className="mt-1 text-xs">Advertised colleges (will be stored unverified): {c.participatingColleges.join(", ")}</p>}
            {r.source_url && <a className="link text-xs" href={r.source_url} target="_blank" rel="noopener noreferrer nofollow">Open source ↗</a>}
            {r.status === "pending" && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <form action={approveQueue} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="sport" defaultValue={c.sport} className="input w-auto py-1">{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                  <select name="eventType" defaultValue={c.eventType} className="input w-auto py-1">{EVENT_TYPES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
                  <label className="flex items-center gap-1"><input type="checkbox" name="verified" /> I verified this against the source</label>
                  <button className="btn-primary py-1.5">Approve</button>
                </form>
                <form action={rejectQueue} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button name="status" value="duplicate" className="btn-secondary py-1.5">Duplicate</button>
                  <button name="status" value="rejected" className="btn-secondary py-1.5">Reject</button>
                </form>
              </div>
            )}
          </div>
        );
      })}
      {(data ?? []).length === 0 && <p className="muted">Queue is empty.</p>}
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Add a camp manually</summary>
        <form action={addManualCandidate} className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          <input name="name" required placeholder="Event name" className="input" />
          <select name="sport" className="input">{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <input name="institution" placeholder="Host college" className="input" />
          <input name="organizer" placeholder="Organizer" className="input" />
          <input name="city" placeholder="City" className="input" />
          <input name="state" placeholder="State (TX)" className="input" />
          <input name="startDate" type="date" className="input" />
          <input name="endDate" type="date" className="input" />
          <input name="price" placeholder="Price as advertised" className="input" />
          <input name="registrationUrl" type="url" placeholder="Official registration URL" className="input" />
          <input name="sourceUrl" type="url" required placeholder="Source URL (required)" className="input sm:col-span-2" />
          <textarea name="description" placeholder="Factual summary in your own words" className="input sm:col-span-2" />
          <button className="btn-primary sm:col-span-2">Add to queue</button>
        </form>
      </details>
    </div>
  );
}
