import { importCampCsv, importExternalReviewCsv } from "@/lib/actions/admin";
import { CAMP_CSV_COLUMNS } from "@/lib/ingestion/adapters/csv";
import { EXTERNAL_REVIEW_CSV_COLUMNS } from "@/lib/external-reviews/csv-import";
import { requireStaff } from "@/lib/server/auth";

export default async function ImportPage() {
  const { db } = await requireStaff("admin");
  const sources = await db<{ id: string; name: string; content_rights: string; terms_reviewed_at: string | null }[]>`
    select id, name, content_rights, terms_reviewed_at from sources where adapter <> 'manual' order by name`;
  const usable = (sources ?? []).filter((s) => s.terms_reviewed_at && !["unknown", "prohibited"].includes(s.content_rights));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bulk CSV import</h1>
      <p className="text-sm muted">Only import datasets CampGrade is authorized to use. Pick the source the data came from — its license and rights apply to every row. Rows go to the review queue; nothing is published automatically, and community reviews are never touched.</p>
      {usable.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Add a source with reviewed terms and content rights in the Source registry first.</p>}
      <section className="card p-4">
        <h2 className="font-semibold">Camps & showcases</h2>
        <p className="mt-1 text-xs muted">Columns: {CAMP_CSV_COLUMNS.join(", ")}. Required: name, source_url. Separate multiple colleges with “;”.</p>
        <form action={importCampCsv} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <select name="sourceId" required className="input w-auto">{usable.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.content_rights})</option>)}</select>
          <input type="file" name="file" accept=".csv,text/csv" required />
          <button className="btn-primary" disabled={!usable.length}>Import to queue</button>
        </form>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">External review data (licensed datasets)</h2>
        <p className="mt-1 text-xs muted">Columns: {EXTERNAL_REVIEW_CSV_COLUMNS.join(", ")}. Required: platform_name, source_url, referenced_name, attribution. Rows are matched to camps with a confidence score and wait for approval. Excerpts and ratings are stored only if the source&apos;s rights allow it. Reviewer identities are never imported.</p>
        <form action={importExternalReviewCsv} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <select name="sourceId" required className="input w-auto">{usable.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.content_rights})</option>)}</select>
          <input type="file" name="file" accept=".csv,text/csv" required />
          <button className="btn-primary" disabled={!usable.length}>Import for review</button>
        </form>
      </section>
    </div>
  );
}
