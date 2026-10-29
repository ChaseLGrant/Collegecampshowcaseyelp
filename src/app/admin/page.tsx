import Link from "next/link";
import { requireStaff } from "@/lib/server/auth";
import { formatDate } from "@/lib/format";

export default async function AdminHome() {
  const { db, user } = await requireStaff("moderator");
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const head = { count: "exact" as const, head: true };
  const [queue, pendingReviews, reports, proofs, stale, failed, ext, research] = await Promise.all([
    db.from("discovery_queue").select("id", head).eq("status", "pending"),
    db.from("reviews").select("id", head).eq("status", "pending"),
    db.from("review_reports").select("id", head).eq("resolved", false),
    db.from("reviews").select("id", head).eq("verification", "pending"),
    db.from("camps").select("id", head).eq("verification_status", "stale").eq("status", "published"),
    db.from("ingestion_runs").select("id,status,error,started_at,sources(name)").in("status", ["failed", "blocked"]).gte("started_at", weekAgo).order("started_at", { ascending: false }).limit(10),
    db.from("external_reviews").select("id", head).eq("status", "pending"),
    db.from("research_summaries").select("id", head).eq("status", "draft"),
  ]);
  const tiles: [string, number | null, string, boolean][] = [
    ["Discovery queue", queue.count, "/admin/discovery", true],
    ["Reviews awaiting moderation", pendingReviews.count, "/admin/reviews", false],
    ["Open review reports", reports.count, "/admin/reviews?tab=reports", false],
    ["Attendance proofs to check", proofs.count, "/admin/reviews?tab=proofs", false],
    ["Stale listings", stale.count, "/admin/camps?filter=stale", true],
    ["External reviews pending", ext.count, "/admin/external-reviews", true],
    ["Research drafts", research.count, "/admin/research", true],
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
