import { moderateReview, verifyAttendance } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import { storageConfigured } from "@/lib/env";
import { proofViewUrl } from "@/lib/storage/proofs";

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { db } = await requireStaff("moderator");
  const tab = (await searchParams).tab ?? "pending";
  const filter =
    tab === "pending" ? db`r.status = 'pending'` :
    tab === "proofs" ? db`r.verification = 'pending'` :
    tab === "reports" ? db`r.id in (select review_id from review_reports where not resolved)` : db`true`;
  const data = await db`
    select r.id, r.title, r.body, r.status, r.spam_score::float as spam_score, r.verification, r.verification_file_path, r.created_at, r.rating_overall,
      json_build_object('name', c.name, 'slug', c.slug) as camps,
      coalesce((select json_agg(json_build_object('reason', rr.reason, 'resolved', rr.resolved)) from review_reports rr where rr.review_id = r.id), '[]') as review_reports
    from reviews r join camps c on c.id = r.camp_id
    where ${filter} order by r.created_at asc limit ${tab === "reports" ? 200 : 50}`;
  type Row = { id: string; title: string; body: string; status: string; spam_score: number; verification: string; verification_file_path: string | null; created_at: string; rating_overall: number; camps: { name: string; slug: string } | null; review_reports: { reason: string; resolved: boolean }[] };
  const rows = data as unknown as Row[];
  const proofUrls: Record<string, string> = {};
  for (const r of rows) {
    if (r.verification_file_path && storageConfigured()) proofUrls[r.id] = await proofViewUrl(r.verification_file_path, 600);
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Review moderation</h1>
      <div className="flex gap-2 text-sm">
        {[["pending", "Pending"], ["reports", "Reported"], ["proofs", "Attendance proofs"]].map(([k, l]) => <a key={k} href={`?tab=${k}`} className={tab === k ? "chip-on py-1" : "chip-off py-1"}>{l}</a>)}
      </div>
      <p className="text-sm muted">You can publish, reject or remove reviews. You cannot edit a review&apos;s words or ratings — only its author can.</p>
      {rows.length === 0 && <p className="muted">Nothing to review.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card p-4 text-sm">
          <p className="font-semibold">{r.title} <span className="font-normal muted">· {r.camps?.name} · {r.rating_overall}★ · {formatDate(r.created_at)} · spam score {r.spam_score} · {r.status}</span></p>
          <p className="mt-1 whitespace-pre-line">{r.body}</p>
          {r.review_reports.filter((x) => !x.resolved).length > 0 && <p className="mt-1 text-xs text-red-700">Reports: {r.review_reports.filter((x) => !x.resolved).map((x) => x.reason).join(", ")}</p>}
          <form action={moderateReview} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="resolveReports" defaultChecked /> resolve reports</label>
            <button name="status" value="published" className="btn-primary py-1">Publish</button>
            <button name="status" value="rejected" className="btn-secondary py-1">Reject</button>
            <button name="status" value="removed" className="btn-secondary py-1">Remove</button>
          </form>
          {r.verification === "pending" && (
            <form action={verifyAttendance} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              {proofUrls[r.id] ? <a className="link text-xs" href={proofUrls[r.id]} target="_blank" rel="noopener noreferrer">View proof (link expires in 10 min)</a> : <span className="text-xs muted">No file</span>}
              <button name="verdict" value="verified" className="btn-secondary py-1">Attendance verified</button>
              <button name="verdict" value="rejected" className="btn-secondary py-1">Not verifiable</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
