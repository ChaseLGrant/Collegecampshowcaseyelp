import { generateResearch, reviewResearch } from "@/lib/actions/admin";
import { aiConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/server/auth";
import type { ResearchFact } from "@/lib/types";

export default async function ResearchAdmin() {
  const { db } = await requireStaff("admin");
  const [drafts, camps] = await Promise.all([
    db`
      select r.*, json_build_object('name', c.name, 'slug', c.slug) as camps
      from research_summaries r join camps c on c.id = r.camp_id
      where r.status = 'draft' order by r.generated_at desc limit 50`,
    db<{ id: string; name: string }[]>`select id, name from camps where status = 'published' order by updated_at desc limit 300`,
  ]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Research quality review</h1>
      <p className="text-sm muted">Summaries are built only from cited facts. {aiConfigured() ? "AI drafting is on (uncited sentences are dropped automatically)." : "AI is not configured (ANTHROPIC_API_KEY), so drafts use the factual template."} Check every sentence against its cited facts before approving.</p>
      <form action={generateResearch} className="card flex flex-wrap items-end gap-2 p-4 text-sm">
        <select name="campId" required className="input w-auto max-w-xs">{(camps ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="tier" className="input w-auto"><option value="insider">Insider only</option><option value="free">Free (public)</option><option value="elite">Elite only</option></select>
        <button className="btn-primary">Generate draft</button>
      </form>
      {(drafts ?? []).map((d: any) => (
        <div key={d.id} className="card p-4 text-sm">
          <p className="font-semibold">{d.camps?.name} <span className="font-normal muted">· {d.method}{d.model ? ` (${d.model})` : ""} · {formatDate(d.generated_at)} · {d.access_tier}</span></p>
          <form action={reviewResearch} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={d.id} />
            <textarea name="summary" defaultValue={d.summary} rows={4} className="input" />
            <ul className="list-disc pl-5">{(d.considerations as string[]).map((c) => <li key={c}>{c}</li>)}</ul>
            <details><summary className="cursor-pointer text-xs muted">Facts ({(d.facts as ResearchFact[]).length})</summary>
              <ul className="mt-1 space-y-0.5 text-xs">{(d.facts as ResearchFact[]).map((f) => <li key={f.id}><b>{f.id}</b> [{f.kind}] {f.text}</li>)}</ul></details>
            <input name="notes" placeholder="Review notes" className="input" />
            <div className="flex gap-2"><button name="decision" value="approved" className="btn-primary py-1">Approve & publish</button><button name="decision" value="rejected" className="btn-secondary py-1">Reject</button></div>
          </form>
        </div>
      ))}
    </div>
  );
}
