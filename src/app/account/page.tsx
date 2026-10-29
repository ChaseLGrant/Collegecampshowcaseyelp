import type { Metadata } from "next";
import Link from "next/link";
import { removeSavedCamp } from "@/lib/actions/saved-lists";
import { hasFeature } from "@/lib/billing/entitlements";
import { athleteMarketConfigured, stripeConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getCurrentAccess, getPlans } from "@/lib/server/access";
import { requireUser } from "@/lib/server/auth";
import { requireSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const TAM_MESSAGES: Record<string, string> = {
  linked: "Your Athlete Market account is linked. Bundled benefits are active.",
  already_linked: "That Athlete Market account is already linked to a different CampGrade account.",
  expired: "The linking session expired. Please try again.",
  error: "We couldn't link your Athlete Market account. Please try again.",
  unavailable: "Athlete Market linking isn't available yet.",
  signin: "Please sign in to CampGrade first.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tam?: string; checkout?: string }> }) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const sql = requireSql();
  // Every query is scoped to the signed-in user (formerly enforced by RLS).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [{ access }, plans, subsRows, linkRows, listRows, reviewRows] = await Promise.all([
    getCurrentAccess(),
    getPlans(),
    sql<any[]>`select plan_id, provider, status, current_period_end, cancel_at_period_end from subscriptions where user_id = ${user.id}`,
    sql<any[]>`select status, linked_at, last_synced_at from athlete_market_links where user_id = ${user.id}`,
    sql<any[]>`
      select l.id, l.name, coalesce(json_agg(json_build_object('camp_id', i.camp_id, 'camps', json_build_object('name', c.name, 'slug', c.slug)))
        filter (where i.camp_id is not null), '[]') as saved_list_items
      from saved_lists l left join saved_list_items i on i.list_id = l.id left join camps c on c.id = i.camp_id
      where l.user_id = ${user.id} group by l.id, l.name`,
    sql<any[]>`
      select r.id, r.title, r.status, r.verification, r.created_at, json_build_object('name', c.name, 'slug', c.slug) as camps
      from reviews r join camps c on c.id = r.camp_id where r.user_id = ${user.id} order by r.created_at desc`,
  ]);
  const subs = { data: subsRows };
  const link = { data: linkRows[0] ?? null };
  const lists = { data: listRows };
  const reviews = { data: reviewRows };
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const tierPlan = plans.find((p) => p.tier === access.tier);
  type ListRow = { id: string; name: string; saved_list_items: { camp_id: string; camps: { name: string; slug: string } | null }[] };
  type ReviewRow = { id: string; title: string; status: string; verification: string; created_at: string; camps: { name: string; slug: string } | null };

  return (
    <div className="container-page max-w-3xl space-y-8 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Your account</h1>
        <form action="/auth/signout" method="post"><button className="btn-ghost">Sign out</button></form>
      </div>
      {sp.checkout === "success" && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Thanks for subscribing! Your access updates within a minute once payment confirms.</p>}
      {sp.tam && TAM_MESSAGES[sp.tam] && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand">{TAM_MESSAGES[sp.tam]}</p>}

      <section className="card p-5">
        <h2 className="font-semibold">Plan</h2>
        <p className="mt-1 text-lg">{tierPlan?.name ?? "Free Community Access"}</p>
        {access.grants.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm muted">
            {access.grants.map((g) => (
              <li key={`${g.source}-${g.planId}`}>
                {planName(g.planId)} via {g.source === "stripe" ? "CampGrade subscription" : g.source === "athlete_market" ? "The Athlete Market" : "CampGrade staff"}
                {g.expiresAt ? ` · renews or ends ${formatDate(g.expiresAt)}` : ""}
              </li>
            ))}
          </ul>
        )}
        {(subs.data ?? []).filter((s) => s.cancel_at_period_end).map((s) => (
          <p key={s.plan_id} className="mt-2 text-sm text-amber-800">{planName(s.plan_id)} is set to cancel on {formatDate(s.current_period_end)}.</p>
        ))}
        <div className="mt-4 flex flex-wrap gap-2">
          {stripeConfigured() && (subs.data ?? []).some((s) => s.provider === "stripe") && (
            <form action="/api/billing/portal" method="post"><button className="btn-secondary">Manage billing</button></form>
          )}
          {access.tier !== "elite" && <Link href="/pricing" className="btn-primary">Upgrade</Link>}
        </div>
      </section>

      <section id="athlete-market" className="card p-5">
        <h2 className="font-semibold">The Athlete Market</h2>
        {link.data?.status === "active" ? (
          <p className="mt-1 text-sm">Linked {formatDate(link.data.linked_at)}{link.data.last_synced_at ? ` · last checked ${formatDate(link.data.last_synced_at)}` : ""}. Recruiting Insider and Insider Elite memberships carry over automatically.</p>
        ) : (
          <>
            <p className="mt-1 text-sm muted">Subscribed to Recruiting Insider or Insider Elite at The Athlete Market? Link your account to activate CampGrade benefits without paying twice. You&apos;ll sign in to The Athlete Market to confirm it&apos;s yours.</p>
            <form action="/api/athlete-market/link" method="post" className="mt-3">
              <button className="btn-secondary" disabled={!athleteMarketConfigured()}>{athleteMarketConfigured() ? "Link The Athlete Market account" : "Linking coming soon"}</button>
            </form>
          </>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Saved camps</h2>
        {!hasFeature(access, "saved_lists") ? (
          <p className="mt-1 text-sm muted">Save and organize camps with <Link href="/pricing" className="link">Recruiting Insider</Link>.</p>
        ) : ((lists.data ?? []) as unknown as ListRow[]).flatMap((l) => l.saved_list_items).length === 0 ? (
          <p className="mt-1 text-sm muted">No saved camps yet. Use &ldquo;Save&rdquo; on any camp page.</p>
        ) : (
          ((lists.data ?? []) as unknown as ListRow[]).map((l) => (
            <div key={l.id} className="mt-3">
              <p className="text-sm font-medium">{l.name}</p>
              <ul className="mt-1 divide-y divide-navy-50 text-sm">
                {l.saved_list_items.map((it) => (
                  <li key={it.camp_id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/camps/${it.camps?.slug}`} className="link">{it.camps?.name}</Link>
                    <form action={removeSavedCamp}><input type="hidden" name="listId" value={l.id} /><input type="hidden" name="campId" value={it.camp_id} /><button className="text-xs muted hover:text-navy">Remove</button></form>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Your reviews</h2>
        {(reviews.data ?? []).length === 0 ? <p className="mt-1 text-sm muted">You haven&apos;t written any reviews yet.</p> : (
          <ul className="mt-2 divide-y divide-navy-50 text-sm">
            {((reviews.data ?? []) as unknown as ReviewRow[]).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/camps/${r.camps?.slug}`} className="link">{r.camps?.name}</Link> — {r.title}</span>
                <span className="text-xs muted">{r.status}{r.verification !== "unverified" ? ` · attendance ${r.verification}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
