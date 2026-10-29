import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { getCurrentAccess, getPlans } from "@/lib/server/access";
import { TIER_RANK } from "@/lib/billing/plans";
import { evalCallUrl, insiderCtaUrl, stripeConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recruiting Insider & Insider Elite",
  description: "Free camp search and community reviews for everyone. Upgrade for premium research, comparisons and personalized camp matching.",
};

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [plans, { userId, access }, sp] = await Promise.all([getPlans(), getCurrentAccess(), searchParams]);
  const insiderUrl = insiderCtaUrl();
  const evalUrl = evalCallUrl();
  return (
    <div className="container-page py-10">
      <h1 className="h1 text-center">Free to discover. Worth upgrading.</h1>
      <p className="mx-auto mt-2 max-w-2xl text-center muted">Searching camps and reading or writing reviews is always free — no account needed to browse. Insider plans add research and planning tools.</p>
      {sp.checkout === "cancelled" && <p className="mx-auto mt-4 max-w-md rounded-lg bg-navy-50 p-3 text-center text-sm">Checkout cancelled — you weren&apos;t charged.</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = access.tier === p.tier;
          const below = TIER_RANK[p.tier] < TIER_RANK[access.tier];
          return (
            <div key={p.id} className={`card flex flex-col p-6 ${p.tier === "insider" ? "border-brand ring-1 ring-brand" : ""}`}>
              <p className="text-lg font-bold">{p.name}</p>
              <p className="mt-1 text-sm muted">{p.tagline}</p>
              <p className="mt-4 text-3xl font-extrabold">{p.priceCents === 0 ? "Free" : formatPrice(p.priceCents)}{p.priceCents > 0 && <span className="text-base font-medium muted">/{p.billingInterval}</span>}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">{p.highlights.map((h) => <li key={h} className="flex gap-2"><span className="text-brand">✓</span>{h}</li>)}</ul>
              <div className="mt-6">
                {p.tier === "free" ? (
                  <Link href="/search" className="btn-secondary w-full">Start searching</Link>
                ) : current ? (
                  <Link href="/account" className="btn-secondary w-full">Your current plan</Link>
                ) : below ? (
                  <span className="btn-secondary w-full opacity-60">Included in your plan</span>
                ) : !(stripeConfigured() && p.stripePriceId) ? (
                  // Until Stripe prices exist, Roster Insider is offered through The Athlete Market.
                  <div className="grid gap-2">
                    <a href={insiderUrl} target="_blank" rel="noopener" className="btn-primary w-full">Get {p.name} at The Athlete Market ↗</a>
                    <a href={evalUrl} target="_blank" rel="noopener" className="btn-secondary w-full">Free eval review call ↗</a>
                  </div>
                ) : !userId ? (
                  <Link href={`/login?next=${encodeURIComponent("/pricing")}`} className="btn-primary w-full">Sign in to upgrade</Link>
                ) : (
                  <form action="/api/billing/checkout" method="post">
                    <input type="hidden" name="planId" value={p.id} />
                    <button className="btn-primary w-full">Get {p.name}</button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card mx-auto mt-8 flex max-w-2xl flex-col gap-3 border-brand/40 bg-brand-50 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Not sure a camp or plan is right for your athlete?</p>
          <p className="mt-1 muted">Book a free eval review call with The Athlete Market. We&apos;ll talk through your athlete&apos;s goals and the events you&apos;re considering. No obligation.</p>
        </div>
        <a href={evalUrl} target="_blank" rel="noopener" className="btn-primary shrink-0">Free eval review call ↗</a>
      </div>
      <div className="card mx-auto mt-4 max-w-2xl p-5 text-sm">
        <p className="font-semibold">Already a member of The Athlete Market?</p>
        <p className="mt-1 muted">Recruiting Insider and Insider Elite members get CampGrade benefits at no extra cost. Sign in, then link your Athlete Market account from your account page — you&apos;ll confirm ownership by signing in to The Athlete Market.</p>
        <Link href="/account#athlete-market" className="link mt-2 inline-block">Activate my benefits →</Link>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs muted">Cancel anytime from your account. Access continues until the end of the paid period. CampGrade does not guarantee recruiting exposure, offers or roster placement.</p>
    </div>
  );
}
