import { updatePlan } from "@/lib/actions/admin";
import { FEATURES, mapPlanRow } from "@/lib/billing/plans";
import { requireStaff } from "@/lib/server/auth";

export default async function PlansAdmin() {
  const { db } = await requireStaff("admin");
  const { data } = await db.from("plans").select("*").order("sort_order");
  const plans = (data ?? []).map(mapPlanRow);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plans & pricing</h1>
      <p className="text-sm muted">To change what customers are charged, create a new Price in Stripe and paste its ID here; the displayed price should match it. Existing subscribers keep their current Stripe price until changed in Stripe.</p>
      {plans.map((p) => (
        <form key={p.id} action={updatePlan} className="card grid gap-2 p-4 text-sm sm:grid-cols-2">
          <input type="hidden" name="id" value={p.id} />
          <p className="font-semibold sm:col-span-2">{p.id} <span className="font-normal muted">(tier: {p.tier})</span></p>
          <div><label className="label">Name</label><input name="name" defaultValue={p.name} className="input" /></div>
          <div><label className="label">Tagline</label><input name="tagline" defaultValue={p.tagline ?? ""} className="input" /></div>
          <div><label className="label">Display price ($)</label><input name="price" type="number" step="0.01" min={0} defaultValue={(p.priceCents / 100).toFixed(2)} className="input" /></div>
          <div><label className="label">Interval</label><select name="billing_interval" defaultValue={p.billingInterval} className="input"><option>month</option><option>year</option></select></div>
          <div><label className="label">Stripe price ID</label><input name="stripe_price_id" defaultValue={p.stripePriceId ?? ""} placeholder="price_…" className="input font-mono" /></div>
          <div><label className="label">Athlete Market product key</label><input name="athlete_market_product_key" defaultValue={p.athleteMarketProductKey ?? ""} className="input font-mono" /></div>
          <div className="sm:col-span-2"><label className="label">Highlights (one per line)</label><textarea name="highlights" defaultValue={p.highlights.join("\n")} rows={4} className="input" /></div>
          <fieldset className="sm:col-span-2"><legend className="label">Features</legend>
            <div className="grid gap-1 sm:grid-cols-2">{Object.entries(FEATURES).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name="features" value={k} defaultChecked={p.features.includes(k as keyof typeof FEATURES)} />{l}</label>
            ))}</div></fieldset>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p.active} /> Active</label>
          <button className="btn-primary sm:col-span-2">Save {p.name}</button>
        </form>
      ))}
    </div>
  );
}
