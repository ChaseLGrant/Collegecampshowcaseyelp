import { reviewExternal } from "@/lib/actions/admin";
import { provenanceLabel } from "@/lib/external-reviews/rights";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import type { ExternalProvenance } from "@/lib/types";

export default async function ExternalReviewsAdmin({ searchParams }: { searchParams: Promise<{ imported?: string; unmatched?: string; errors?: string }> }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  const { data } = await db.from("external_reviews").select("*, camps(name,slug), sources(name,content_rights)").eq("status", "pending").order("imported_at", { ascending: false }).limit(100);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">External review research</h1>
      {sp.imported && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand">Imported {sp.imported} for review · {sp.unmatched} couldn&apos;t be matched to a camp · {sp.errors} rows had errors.</p>}
      <p className="text-sm muted">Check that each record refers to the right camp, that the source&apos;s license allows what will be displayed, and that attribution is correct. Unlicensed text and ratings stay hidden; visitors get a link to the original.</p>
      {(data ?? []).length === 0 && <p className="muted">Nothing pending.</p>}
      {(data ?? []).map((r: any) => (
        <div key={r.id} className="card p-4 text-sm">
          <p className="font-semibold">{r.platform_name} → {r.camps?.name ?? "organizer-level"} <span className="font-normal muted">· match {Math.round(r.match_confidence * 100)}% ({r.match_method})</span></p>
          <p className="muted">“{r.referenced_name}” · {provenanceLabel(r.provenance_type as ExternalProvenance)} · {r.review_date ? formatDate(r.review_date) : "no date"} · source {r.sources?.name} ({r.sources?.content_rights})</p>
          {r.rating != null && <p>Rating: {r.rating}/{r.rating_scale}</p>}
          {r.excerpt && <p className="mt-1 italic">“{r.excerpt}”</p>}
          <p className="mt-1 text-xs">Attribution: {r.attribution} · <a className="link" href={r.source_url} target="_blank" rel="noopener noreferrer nofollow">original ↗</a></p>
          <form action={reviewExternal} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <select name="rights_status" defaultValue={r.rights_status} className="input w-auto py-1">
              {["licensed", "permitted", "link_only", "pending_review", "prohibited"].map((x) => <option key={x}>{x}</option>)}
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" name="rating_display_permitted" defaultChecked={r.rating_display_permitted} /> show rating</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="excerpt_permitted" defaultChecked={r.excerpt_permitted} /> show excerpt</label>
            <button name="decision" value="approved" className="btn-primary py-1">Approve</button>
            <button name="decision" value="rejected" className="btn-secondary py-1">Reject</button>
          </form>
        </div>
      ))}
    </div>
  );
}
