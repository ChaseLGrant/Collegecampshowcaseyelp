import Link from "next/link";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import { SPORTS, sportLabel } from "@/lib/sports";
import { parseLeadFilters, queryLeads } from "./query";

export default async function LeadsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { db } = await requireStaff("admin");
  const f = parseLeadFilters(await searchParams);
  const [rows, [{ total }]] = await Promise.all([
    queryLeads(db, f, 500),
    db<{ total: number }[]>`select count(*)::int as total from leads`,
  ]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Leads <span className="text-base font-normal muted">({total} total)</span></h1>
        <Link href={`/admin/leads/export${qs ? `?${qs}` : ""}`} className="btn-secondary" prefetch={false}>Export CSV</Link>
      </div>
      <p className="text-sm muted">Camp-alert and coach-call sign-ups. One row per email + sport; repeat sign-ups update the row. Everyone here checked the contact consent box.</p>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={f.q ?? ""} placeholder="Search email, name or camp" className="input w-64" />
        <select name="sport" defaultValue={f.sport ?? ""} className="input w-auto"><option value="">All sports</option>{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select name="interest" defaultValue={f.interest ?? ""} className="input w-auto"><option value="">All interests</option><option value="camp_alerts">Camp alerts</option><option value="coach_call">Coach call</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      {rows.length === 0 ? <p className="muted">No leads yet.</p> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Updated</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Grad</th><th>Sport</th><th>Interest</th><th>Source</th><th>Camp</th><th>#</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDate(r.updated_at)}</td>
                  <td>{r.name ?? "—"}</td>
                  <td><a className="link" href={`mailto:${r.email}`}>{r.email}</a></td>
                  <td className="whitespace-nowrap">{r.phone ?? "—"}</td>
                  <td>{r.role}</td>
                  <td>{r.grad_year ?? "—"}</td>
                  <td>{sportLabel(r.sport)}</td>
                  <td>{r.interest === "coach_call" ? <span className="tag bg-brand-50 text-brand">Coach call</span> : "Alerts"}</td>
                  <td className="text-xs">{r.source_page ?? "—"}</td>
                  <td className="text-xs">{r.camp_slug ? <Link className="link" href={`/camps/${r.camp_slug}`}>{r.camp_slug}</Link> : "—"}</td>
                  <td>{r.submission_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
