import { grantEntitlement, revokeEntitlement } from "@/lib/actions/admin";
import { isActive } from "@/lib/billing/entitlements";
import { formatDate } from "@/lib/format";
import { mapEntitlementRow } from "@/lib/server/access";
import { requireStaff } from "@/lib/server/auth";

export default async function EntitlementsAdmin({ searchParams }: { searchParams: Promise<{ user?: string; error?: string }> }) {
  const { db } = await requireStaff("admin");
  const sp = await searchParams;
  const userId = sp.user && /^[0-9a-f-]{36}$/.test(sp.user) ? sp.user : null;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const none = Promise.resolve([] as any[]);
  const [plans, entRows, subRows, linkRows, recentRows] = await Promise.all([
    db<{ id: string; name: string }[]>`select id, name from plans order by sort_order`,
    userId ? db<any[]>`select * from entitlements where user_id = ${userId} order by created_at desc` : none,
    userId ? db<any[]>`select * from subscriptions where user_id = ${userId}` : none,
    userId ? db<any[]>`select * from athlete_market_links where user_id = ${userId}` : none,
    db<any[]>`select user_id, plan_id, provider, status, updated_at from subscriptions order by updated_at desc limit 25`,
  ]);
  const ents = { data: entRows };
  const subs = { data: subRows };
  const link = { data: linkRows[0] ?? null };
  const recent = { data: recentRows };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Subscriptions & entitlements</h1>
      {sp.error === "user" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">No user found with that ID or email.</p>}
      <form className="flex gap-2 text-sm"><input name="user" defaultValue={userId ?? ""} placeholder="User ID" className="input w-80 font-mono" /><button className="btn-secondary">Look up</button></form>
      {userId && (
        <section className="card space-y-3 p-4 text-sm">
          <p className="font-semibold font-mono">{userId}</p>
          <p>Athlete Market link: {link.data ? `${(link.data as any).athlete_market_account_id} (${(link.data as any).status})` : "none"}</p>
          <table className="table"><thead><tr><th>Plan</th><th>Source</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>
            {(ents.data ?? []).map((e: any) => (
              <tr key={e.id}><td>{e.plan_id}</td><td>{e.source}</td><td>{e.expires_at ? formatDate(e.expires_at) : "never"}</td>
                <td>{isActive(mapEntitlementRow(e)) ? "active" : e.revoked_at ? "revoked" : "expired"}</td>
                <td>{!e.revoked_at && <form action={revokeEntitlement}><input type="hidden" name="id" value={e.id} /><button className="text-xs link">Revoke</button></form>}</td></tr>
            ))}</tbody></table>
          <p className="text-xs muted">Stripe-managed access should be changed in Stripe (it re-syncs via webhook). Revoking here is for support cases.</p>
          {(subs.data ?? []).map((s: any) => <p key={s.id} className="text-xs">Subscription {s.provider} {s.external_id}: {s.status}, period ends {formatDate(s.current_period_end)}{s.cancel_at_period_end ? " (cancelling)" : ""}</p>)}
        </section>
      )}
      <form action={grantEntitlement} className="card flex flex-wrap items-end gap-2 p-4 text-sm">
        <div><label className="label">User ID or email</label><input name="user" required defaultValue={userId ?? ""} className="input w-72" /></div>
        <div><label className="label">Plan</label><select name="planId" className="input">{(plans ?? []).filter((p) => p.id !== "free").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="label">Days</label><input name="days" type="number" min={1} defaultValue={30} className="input w-24" /></div>
        <div><label className="label">Notes</label><input name="notes" className="input" placeholder="Reason (support, partner, comp)" /></div>
        <button className="btn-primary">Grant access</button>
      </form>
      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Recent subscription changes</h2>
        <ul className="mt-2 space-y-1">{(recent.data ?? []).map((s: any, i: number) => <li key={i}><a className="link font-mono text-xs" href={`?user=${s.user_id}`}>{s.user_id.slice(0, 8)}…</a> {s.plan_id} via {s.provider}: {s.status} · {formatDate(s.updated_at)}</li>)}</ul>
      </section>
    </div>
  );
}
