import Link from "next/link";
import { updateCamp, verifyParticipatingCollege } from "@/lib/actions/admin";
import { formatDate, formatDateRange } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import { SPORTS } from "@/lib/sports";

export default async function AdminCampsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  let q = db.from("camps").select("id,slug,name,sport,status,verification_status,last_verified_at,start_date,end_date,source_url,camp_participating_colleges(institution_id,verified,institutions(name))").order("updated_at", { ascending: false }).limit(100);
  if (sp.filter === "stale") q = q.eq("verification_status", "stale");
  if (sp.filter === "unverified") q = q.eq("verification_status", "unverified");
  if (sp.q) q = q.ilike("name", `%${sp.q.replace(/[%_,()]/g, " ")}%`);
  const { data } = await q;
  type Row = { id: string; slug: string; name: string; sport: string; status: string; verification_status: string; last_verified_at: string | null; start_date: string | null; end_date: string | null; source_url: string | null; camp_participating_colleges: { institution_id: string; verified: boolean; institutions: { name: string } | null }[] };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Camps</h1>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Search name" className="input w-auto" />
        <select name="filter" defaultValue={sp.filter ?? ""} className="input w-auto"><option value="">All</option><option value="stale">Stale</option><option value="unverified">Unverified</option></select>
        <button className="btn-secondary">Filter</button>
      </form>
      {((data ?? []) as unknown as Row[]).map((c) => (
        <div key={c.id} className="card p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/camps/${c.slug}`} className="font-semibold link">{c.name}</Link>
            <span className="tag bg-navy-50">{c.verification_status}{c.last_verified_at ? ` ${formatDate(c.last_verified_at)}` : ""}</span>
            <span className="muted">{formatDateRange(c.start_date, c.end_date)}</span>
            {c.source_url && <a href={c.source_url} className="link text-xs" target="_blank" rel="noopener noreferrer nofollow">source ↗</a>}
          </div>
          <form action={updateCamp} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={c.id} />
            <select name="sport" defaultValue={c.sport} className="input w-auto py-1">{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <select name="status" defaultValue={c.status} className="input w-auto py-1">{["published", "draft", "cancelled", "archived"].map((s) => <option key={s}>{s}</option>)}</select>
            <label className="flex items-center gap-1"><input type="checkbox" name="markVerified" /> Re-verified against source today</label>
            <button className="btn-secondary py-1">Save</button>
          </form>
          {c.camp_participating_colleges.filter((p) => !p.verified).map((p) => (
            <form key={p.institution_id} action={verifyParticipatingCollege} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <input type="hidden" name="campId" value={c.id} /><input type="hidden" name="institutionId" value={p.institution_id} />
              <span>Advertised: {p.institutions?.name}</span>
              <input name="sourceUrl" type="url" required placeholder="Official source confirming attendance" className="input w-72 py-1" />
              <button className="btn-secondary py-1">Mark verified</button>
            </form>
          ))}
        </div>
      ))}
    </div>
  );
}
