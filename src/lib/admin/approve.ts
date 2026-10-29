import "server-only";
import type { Sql } from "../db";
import { slugify } from "../format";
import type { NormalizedCandidate } from "../ingestion/types";

async function upsertNamed(sql: Sql, table: "institutions" | "organizers", name: string | null, extra: Record<string, unknown> = {}) {
  if (!name) return null;
  const slug = slugify(name);
  const [existing] = await sql<{ id: string }[]>`select id from ${sql(table)} where slug = ${slug}`;
  if (existing) return existing.id;
  const row = { name, slug, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) };
  const [created] = await sql<{ id: string }[]>`
    insert into ${sql(table)} ${sql(row as Record<string, string | null>)}
    on conflict (slug) do update set name = ${sql(table)}.name returning id`;
  return created.id;
}

async function uniqueCampSlug(sql: Sql, c: NormalizedCandidate) {
  const base = slugify([c.name, c.startDate?.slice(0, 4)].filter(Boolean).join(" "));
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await sql`select id from camps where slug = ${slug}`;
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const FACT_FIELDS: [keyof NormalizedCandidate, string][] = [
  ["name", "name"], ["sport", "sport"], ["eventType", "event_type"], ["city", "city"], ["state", "state"],
  ["venue", "venue"], ["startDate", "start_date"], ["endDate", "end_date"], ["priceCents", "price_cents"],
  ["priceNotes", "price_notes"], ["registrationUrl", "registration_url"], ["description", "description"],
  ["eligibility", "eligibility"],
];

/**
 * Publishes (or updates) a camp from an approved queue item. Only factual camp
 * fields are written — this code path has no access to community reviews.
 */
export async function approveQueueItem(sql: Sql, itemId: string, adminId: string, opts: {
  verifiedAgainstSource: boolean; overrides?: Partial<NormalizedCandidate>;
}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [item] = await sql<any[]>`select * from discovery_queue where id = ${itemId}`;
  if (!item) throw new Error("Queue item not found");
  if (item.status !== "pending") throw new Error("Item already reviewed");
  const c: NormalizedCandidate = { ...item.candidate, ...(opts.overrides ?? {}) };
  if (!c.name || !c.sport) throw new Error("Name and sport are required");

  const institutionId = await upsertNamed(sql, "institutions", c.institution, { state: c.state ?? undefined });
  const organizerId = await upsertNamed(sql, "organizers", c.organizer, { kind: institutionId ? "college" : "showcase_company" });
  const now = new Date().toISOString();
  const facts: Record<string, any> = {};
  for (const [k, col] of FACT_FIELDS) if (c[k] !== undefined && c[k] !== null) facts[col] = c[k];

  let campId: string;
  if (item.kind === "camp_update" && item.matched_camp_id) {
    campId = item.matched_camp_id;
    const patch: Record<string, any> = { ...facts, source_url: item.source_url ?? null };
    if (institutionId) patch.institution_id = institutionId;
    if (organizerId) patch.organizer_id = organizerId;
    if (opts.verifiedAgainstSource) Object.assign(patch, { last_verified_at: now, verification_status: "verified" });
    await sql`update camps set ${sql(patch)} where id = ${campId}`;
  } else {
    const row: Record<string, any> = {
      ...facts, slug: await uniqueCampSlug(sql, c), institution_id: institutionId, organizer_id: organizerId,
      primary_source_id: item.source_id ?? null, source_url: item.source_url ?? null, status: "published",
      verification_status: opts.verifiedAgainstSource ? "verified" : "unverified",
      last_verified_at: opts.verifiedAgainstSource ? now : null,
    };
    const [camp] = await sql<{ id: string }[]>`insert into camps ${sql(row)} returning id`;
    campId = camp.id;
  }

  for (const [field, value] of Object.entries(facts)) {
    await sql`
      insert into camp_field_provenance (camp_id, field, value, source_id, source_url, observed_at)
      values (${campId}, ${field}, ${JSON.stringify(value)}::jsonb, ${item.source_id ?? null}, ${item.source_url ?? null}, ${item.created_at})`;
  }
  // Participating colleges from sources are stored UNVERIFIED until an admin confirms each.
  for (const name of c.participatingColleges ?? []) {
    const instId = await upsertNamed(sql, "institutions", name);
    if (instId) {
      await sql`
        insert into camp_participating_colleges (camp_id, institution_id, verified, source_url)
        values (${campId}, ${instId}, false, ${item.source_url ?? null}) on conflict (camp_id, institution_id) do nothing`;
    }
  }
  for (const co of c.coaches ?? []) {
    await sql`insert into camp_coaches (camp_id, coach_name, title, verified, source_url) values (${campId}, ${co.name}, ${co.title ?? null}, false, ${item.source_url ?? null})`;
  }
  await sql`update discovery_queue set status = 'approved', reviewer_id = ${adminId}, reviewed_at = ${now}, matched_camp_id = ${campId} where id = ${itemId}`;
  return campId;
}
