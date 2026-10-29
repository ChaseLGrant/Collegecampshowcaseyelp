import type { Metadata } from "next";
import Link from "next/link";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { StoredCompareLink } from "@/components/StoredCompareLink";
import { hasFeature } from "@/lib/billing/entitlements";
import { buildComparison } from "@/lib/compare/compare";
import { getVisitorRepository } from "@/lib/data";
import { getCurrentAccess } from "@/lib/server/access";
import { STATE_CODES, normalizeState, stateName } from "@/lib/states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compare camps side by side", robots: { index: false } };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ camps?: string; home?: string }> }) {
  const sp = await searchParams;
  const { access } = await getCurrentAccess();
  const advanced = hasFeature(access, "advanced_compare");
  const max = advanced ? 4 : 2;
  const requested = (sp.camps ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]{1,120}$/.test(s));
  const slugs = [...new Set(requested)].slice(0, max);
  const homeState = normalizeState(sp.home);
  const repo = await getVisitorRepository();
  const camps = await repo.getCampsBySlugs(slugs);

  const external: Record<string, Awaited<ReturnType<typeof repo.listExternalReviews>>> = {};
  const research: Record<string, Awaited<ReturnType<typeof repo.getResearchSummary>>> = {};
  if (advanced) {
    await Promise.all(camps.map(async (c) => {
      [external[c.id], research[c.id]] = await Promise.all([repo.listExternalReviews(c.id), repo.getResearchSummary(c.id, access.tier)]);
    }));
  }
  const { rows, tradeoffs } = buildComparison(camps, { homeState, external, research, advanced });

  return (
    <div className="container-page py-8">
      <h1 className="h1">Compare camps</h1>
      <p className="mt-1 muted">Side by side, with every detail labeled as a verified fact, an advertised claim, community opinion, or research.</p>
      {camps.length < 2 ? (
        <div className="card mt-6 p-6"><StoredCompareLink /></div>
      ) : (
        <>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="camps" value={slugs.join(",")} />
            <div>
              <label className="label" htmlFor="home">Your home state (for travel estimates)</label>
              <select id="home" name="home" defaultValue={homeState ?? ""} className="input">
                <option value="">Not set</option>
                {STATE_CODES.map((c) => <option key={c} value={c}>{stateName(c)}</option>)}
              </select>
            </div>
            <button className="btn-secondary">Update</button>
          </form>
          <div className="mt-6 overflow-x-auto">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-40"></th>
                  {camps.map((c) => <th key={c.id}><Link href={`/camps/${c.slug}`} className="link">{c.name}</Link></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="font-medium">{r.label}</th>
                    {r.cells.map((cell, i) => (
                      <td key={i}><div className="flex flex-col items-start gap-1"><span>{cell.text}</span><ProvenanceTag kind={cell.kind} /></div></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="card mt-6 p-5">
            <h2 className="font-semibold">Tradeoffs at a glance</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="mt-3 text-xs muted">Generated from the listing facts and community ratings above. Not a guarantee of any recruiting outcome.</p>
          </section>
        </>
      )}
      {!advanced && (
        <div className="card mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Compare up to 4 camps with external research and research summaries with <span className="font-semibold">Recruiting Insider</span>.{requested.length > 2 ? " (Showing your first 2 selections.)" : ""}</p>
          <Link href="/pricing" className="btn-secondary shrink-0">See Insider</Link>
        </div>
      )}
    </div>
  );
}
