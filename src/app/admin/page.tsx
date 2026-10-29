import Link from "next/link";
import { requireStaff } from "@/lib/server/auth";
import { formatDate } from "@/lib/format";

export default async function AdminHome() {
  const { db, user } = await requireStaff("moderator");
  const [[c], failedRows] = await Promise.all([
    db<Record<string, number>[]>`
      select
        (select count(*)::int from discovery_queue where status = 'pending') as queue,
        (select count(*)::int from reviews where status = 'pending') as pending_reviews,
        (select count(*)::int from review_reports where not resolved) as reports,
        (select count(*)::int from reviews where verification = 'pending') as proofs,
        (select count(*)::int from camps where verification_status = 'stale' and status = 'published') as stale,
        (select count(*)::int from external_reviews where status = 'pending') as ext,
        (select count(*)::int from research_summaries where status = 'draft') as research,
        (select count(*)::int from leads) as leads`,
    db`
      select r.id, r.status, r.error, r.started_at, case when s.id is null then null else json_build_object('name', s.name) end as sources
      from ingestion_runs r left join sources s on s.id = r.source_id
      where r.status in ('failed', 'blocked') and r.started_at >= now() - interval '7 days'
      order by r.started_at desc limit 10`,
  ]);
  const n = (count: number) => ({ count });
  const [queue, pendingReviews, reports, proofs, stale, ext, research, leads] =
    [c.queue, c.pending_reviews, c.reports, c.proofs, c.stale, c.ext, c.research, c.leads].map(n);
  const failed = { data: failedRows };
  const tiles: [string, number | null, string, boolean][] = [
    ["Discovery queue", queue.count, "/admin/discovery", true],
    ["Reviews awaiting moderation", pendingReviews.count, "/admin/reviews", false],
    ["Open review reports", reports.count, "/admin/reviews?tab=reports", false],
    ["Attendance proofs to check", proofs.count, "/admin/reviews?tab=proofs", false],
    ["Stale listings", stale.count, "/admin/camps?filter=stale", true],
    ["External reviews pending", ext.count, "/admin/external-reviews", true],
    ["Research drafts", research.count, "/admin/research", true],
    ["Leads", leads.count, "/admin/leads", true],
  ];
  type Run = { id: string; status: string; error: string | null; started_at: string; sources: { name: string } | null };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.filter(([, , , adminOnly]) => !adminOnly || user.role === "admin").map(([label, n, href]) => (
          <Link key={label} href={href} className="card p-4 hover:border-brand/40"><p className="text-2xl font-bold">{n ?? 0}</p><p className="text-sm muted">{label}</p></Link>
        ))}
      </div>
      {user.role === "admin" && (
        <section className="card p-4">
          <h2 className="font-semibold">Failed import alerts (last 7 days)</h2>
          {(failed.data ?? []).length === 0 ? <p className="mt-1 text-sm muted">No failures.</p> : (
            <ul className="mt-2 divide-y divide-navy-50 text-sm">
              {((failed.data ?? []) as unknown as Run[]).map((r) => (
                <li key={r.id} className="py-2"><span className={`tag mr-2 ${r.status === "blocked" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-700"}`}>{r.status}</span>{r.sources?.name ?? "Manual"} · {formatDate(r.started_at)} — <span className="muted">{r.error}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
