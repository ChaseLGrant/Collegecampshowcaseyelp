import type { Metadata } from "next";
import Link from "next/link";
import { hasFeature } from "@/lib/billing/entitlements";
import { saveMatchProfile } from "@/lib/actions/match";
import { getVisitorRepository } from "@/lib/data";
import { formatDateRange, formatPrice, locationLabel } from "@/lib/format";
import { LEVELS, MATCH_DISCLAIMER, matchCamps, matchProfileSchema, type MatchProfile } from "@/lib/matching/score";
import { parseSearchFilters } from "@/lib/search";
import { getCurrentAccess } from "@/lib/server/access";
import { requireSql } from "@/lib/db";
import { SPORTS } from "@/lib/sports";
import { STATE_CODES, stateName } from "@/lib/states";
import type { CampDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Personalized camp matching", robots: { index: false } };

export default async function MatchPage() {
  const { userId, access } = await getCurrentAccess();
  const allowed = hasFeature(access, "camp_matching");
  if (!allowed) {
    return (
      <div className="container-page max-w-2xl py-10">
        <h1 className="h1">Personalized camp matching</h1>
        <p className="mt-2 muted">Tell us your athlete&apos;s sport, position, class, location, target college level and budget. We&apos;ll rank upcoming camps and explain why each one fits — and what to double-check.</p>
        <div className="card mt-6 p-5">
          <p className="text-sm">Camp matching and school-targeting recommendations are part of <span className="font-semibold">Insider Elite</span>. Browsing and reviews stay free.</p>
          <Link href={userId ? "/pricing" : "/login?next=/match"} className="btn-primary mt-3">{userId ? "See Insider Elite" : "Sign in"}</Link>
        </div>
      </div>
    );
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [row] = await requireSql()<any[]>`select * from match_profiles where user_id = ${userId!}`;
  let profile: MatchProfile | null = null;
  if (row) {
    const p = matchProfileSchema.safeParse({
      sport: row.sport, position: row.position ?? undefined, gradYear: row.grad_year ?? undefined, homeState: row.home_state ?? undefined,
      preferredLevels: row.preferred_levels ?? [], gpa: row.gpa != null ? Number(row.gpa) : undefined, maxTravelMiles: row.max_travel_miles ?? undefined,
      budgetDollars: row.budget_cents != null ? row.budget_cents / 100 : undefined,
    });
    if (p.success) profile = p.data;
  }
  let results: ReturnType<typeof matchCamps> = [];
  if (profile) {
    const repo = await getVisitorRepository();
    const pool = await repo.searchCamps(parseSearchFilters({ sport: profile.sport, pageSize: "60", sort: "date" }));
    const detailed = await repo.getCampsBySlugs(pool.items.map((c) => c.slug));
    const bySlug = new Map(detailed.map((d) => [d.slug, d]));
    const camps: CampDetail[] = pool.items.map((c) => bySlug.get(c.slug) ?? { ...c, venue: null, description: null, eligibility: null, positions: [], participatingColleges: [], coaches: [] });
    results = matchCamps(camps, profile, 20);
  }

  return (
    <div className="container-page py-8">
      <h1 className="h1">Your camp matches</h1>
      <p className="mt-1 text-sm muted">{MATCH_DISCLAIMER}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <form action={saveMatchProfile} className="card h-fit space-y-3 p-4">
          <p className="font-semibold">Athlete profile</p>
          <div><label className="label" htmlFor="m-sport">Sport</label>
            <select id="m-sport" name="sport" className="input" defaultValue={profile?.sport ?? "baseball"} required>{SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="m-pos">Position</label><input id="m-pos" name="position" className="input" defaultValue={profile?.position ?? ""} placeholder="e.g. RHP" /></div>
            <div><label className="label" htmlFor="m-grad">Grad year</label><input id="m-grad" name="gradYear" inputMode="numeric" className="input" defaultValue={profile?.gradYear ?? ""} placeholder="2028" /></div>
          </div>
          <div><label className="label" htmlFor="m-state">Home state</label>
            <select id="m-state" name="homeState" className="input" defaultValue={profile?.homeState ?? ""}><option value="">Not set</option>{STATE_CODES.map((c) => <option key={c} value={c}>{stateName(c)}</option>)}</select></div>
          <fieldset><legend className="label">Preferred college levels</legend>
            <div className="flex flex-wrap gap-2 text-sm">{LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-1"><input type="checkbox" name="preferredLevels" value={l} defaultChecked={profile?.preferredLevels.includes(l)} />{l}</label>
            ))}</div></fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="m-miles">Max travel (mi)</label><input id="m-miles" name="maxTravelMiles" inputMode="numeric" className="input" defaultValue={profile?.maxTravelMiles ?? ""} /></div>
            <div><label className="label" htmlFor="m-budget">Budget ($)</label><input id="m-budget" name="budgetDollars" inputMode="numeric" className="input" defaultValue={profile?.budgetDollars ?? ""} /></div>
          </div>
          <div><label className="label" htmlFor="m-gpa">GPA (optional)</label><input id="m-gpa" name="gpa" inputMode="decimal" className="input" defaultValue={profile?.gpa ?? ""} /></div>
          <p className="text-xs muted">Academic info is optional and stored privately on your account. It is never shared with camps.</p>
          <button className="btn-primary w-full">Find matches</button>
        </form>
        <div>
          {!profile ? <p className="muted">Fill in the profile to see matches.</p> : results.length === 0 ? (
            <div className="card p-6"><p className="font-semibold">No upcoming camps match all of your criteria.</p><p className="mt-1 text-sm muted">Try a larger travel distance or budget.</p></div>
          ) : (
            <ol className="space-y-4">
              {results.map((r, i) => (
                <li key={r.camp.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs muted">#{i + 1} · fit score {r.score}/100</p>
                      <Link href={`/camps/${r.camp.slug}`} className="font-semibold hover:text-brand">{r.camp.name}</Link>
                      <p className="text-sm muted">{locationLabel(r.camp.city, r.camp.state)} · {formatDateRange(r.camp.startDate, r.camp.endDate)} · {formatPrice(r.camp.priceCents)}</p>
                    </div>
                  </div>
                  {r.reasons.length > 0 && <><p className="mt-2 text-sm font-medium">Why it&apos;s here</p><ul className="list-disc pl-5 text-sm">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></>}
                  {r.cautions.length > 0 && <><p className="mt-2 text-sm font-medium">Double-check</p><ul className="list-disc pl-5 text-sm text-amber-900">{r.cautions.map((x) => <li key={x}>{x}</li>)}</ul></>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
