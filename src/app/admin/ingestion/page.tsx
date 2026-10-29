import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";

export default async function IngestionPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  let q = db.from("ingestion_runs").select("*, sources(name)").order("started_at", { ascending: false }).limit(100);
  if (sp.source && /^[0-9a-f-]{36}$/.test(sp.source)) q = q.eq("source_id", sp.source);
  const { data } = await q;
  type Run = { id: string; status: string; triggered_by: string; started_at: string; finished_at: string | null; items_found: number; items_queued: number; items_skipped: number; error: string | null; log: string[]; sources: { name: string } | null };
  const color: Record<string, string> = { succeeded: "bg-emerald-50 text-emerald-800", partial: "bg-amber-50 text-amber-900", failed: "bg-red-50 text-red-700", blocked: "bg-amber-50 text-amber-900", running: "bg-navy-50" };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ingestion history</h1>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Started</th><th>Source</th><th>Trigger</th><th>Status</th><th>Found</th><th>Queued</th><th>Skipped</th><th>Details</th></tr></thead>
          <tbody>
            {((data ?? []) as unknown as Run[]).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatDate(r.started_at)}</td>
                <td>{r.sources?.name ?? "—"}</td>
                <td>{r.triggered_by}</td>
                <td><span className={`tag ${color[r.status] ?? ""}`}>{r.status}</span></td>
                <td>{r.items_found}</td><td>{r.items_queued}</td><td>{r.items_skipped}</td>
                <td className="max-w-md text-xs">{r.error && <p className="text-red-700">{r.error}</p>}
                  {r.log?.length > 0 && <details><summary className="cursor-pointer muted">Log ({r.log.length})</summary><ul className="mt-1 space-y-0.5">{r.log.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
