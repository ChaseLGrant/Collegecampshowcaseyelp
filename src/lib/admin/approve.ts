import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "../format";
import type { NormalizedCandidate } from "../ingestion/types";

async function upsertNamed(db: SupabaseClient, table: "institutions" | "organizers", name: string | null, extra: Record<string, unknown> = {}) {
  if (!name) return null;
  const slug = slugify(name);
  const { data: existing } = await db.from(table).select("id").eq("slug", slug).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await db.from(table).insert({ name, slug, ...extra }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function uniqueCampSlug(db: SupabaseClient, c: NormalizedCandidate) {
  const base = slugify([c.name, c.startDate?.slice(0, 4)].filter(Boolean).join(" "));
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await db.from("camps").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
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
export async function approveQueueItem(db: SupabaseClient, itemId: string, adminId: string, opts: {
  verifiedAgainstSource: boolean; overrides?: Partial<NormalizedCandidate>;
}) {
  const { data: item, error } = await db.from("discovery_queue").select("*").eq("id", itemId).single();
  if (error || !item) throw new Error("Queue item not found");
  if (item.status !== "pending") throw new Error("Item already reviewed");
  const c: NormalizedCandidate = { ...item.candidate, ...(opts.overrides ?? {}) };
  if (!c.name || !c.sport) throw new Error("Name and sport are required");

  const institutionId = await upsertNamed(db, "institutions", c.institution, { state: c.state });
  const organizerId = await upsertNamed(db, "organizers", c.organizer, { kind: institutionId ? "college" : "showcase_company" });
  const now = new Date().toISOString();
  const facts: Record<string, unknown> = {};
  for (const [k, col] of FACT_FIELDS) if (c[k] !== undefined && c[k] !== null) facts[col] = c[k];

  let campId: string;
  if (item.kind === "camp_update" && item.matched_camp_id) {
    campId = item.matched_camp_id;
    await db.from("camps").update({
      ...facts, institution_id: institutionId ?? undefined, organizer_id: organizerId ?? undefined,
      source_url: item.source_url,
      ...(opts.verifiedAgainstSource ? { last_verified_at: now, verification_status: "verified" } : {}),
    }).eq("id", campId);
  } else {
    const { data: camp, error: e2 } = await db.from("camps").insert({
      ...facts, slug: await uniqueCampSlug(db, c), institution_id: institutionId, organizer_id: organizerId,
      primary_source_id: item.source_id, source_url: item.source_url, status: "published",
      verification_status: opts.verifiedAgainstSource ? "verified" : "unverified",
      last_verified_at: opts.verifiedAgainstSource ? now : null,
    }).select("id").single();
    if (e2) throw new Error(e2.message);
    campId = camp.id;
  }

  await db.from("camp_field_provenance").insert(
    Object.entries(facts).map(([field, value]) => ({ camp_id: campId, field, value, source_id: item.source_id, source_url: item.source_url, observed_at: item.created_at })),
  );
  // Participating colleges from sources are stored UNVERIFIED until an admin confirms each.
  for (const name of c.participatingColleges ?? []) {
    const instId = await upsertNamed(db, "institutions", name);
    if (instId) await db.from("camp_participating_colleges").upsert({ camp_id: campId, institution_id: instId, verified: false, source_url: item.source_url }, { onConflict: "camp_id,institution_id", ignoreDuplicates: true });
  }
  for (const co of c.coaches ?? []) {
    await db.from("camp_coaches").insert({ camp_id: campId, coach_name: co.name, title: co.title, verified: false, source_url: item.source_url });
  }
  await db.from("discovery_queue").update({ status: "approved", reviewer_id: adminId, reviewed_at: now, matched_camp_id: campId }).eq("id", itemId);
  return campId;
}
