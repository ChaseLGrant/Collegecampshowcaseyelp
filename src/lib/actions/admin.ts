"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { approveQueueItem } from "../admin/approve";
import { makeIngestionStore, mapSourceRow } from "../admin/ingestion-store";
import { csvRowsToCandidates } from "../ingestion/adapters/csv";
import { prepareQueueItems, runSource } from "../ingestion/pipeline";
import { parseExternalReviewCsv } from "../external-reviews/csv-import";
import { bestCampMatch } from "../external-reviews/matching";
import { defaultRightsForSource } from "../external-reviews/rights";
import { mapDetailRow, mapExternalPublicRow } from "../data/mappers";
import { buildResearchFacts } from "../research/facts";
import { draftResearchSummary } from "../research/ai";
import { FEATURES } from "../billing/plans";
import { audit, requireStaff } from "../server/auth";
import { EVENT_TYPE_IDS, SPORT_IDS } from "../sports";
import { deleteProof } from "../storage/proofs";

const uuid = z.string().uuid();
const MAX_UPLOAD = 5 * 1024 * 1024;

/* ---------------- Discovery queue ---------------- */
export async function approveQueue(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const overrides: Record<string, unknown> = {};
  const sport = formData.get("sport");
  if (sport && SPORT_IDS.includes(sport as never)) overrides.sport = sport;
  const eventType = formData.get("eventType");
  if (eventType && EVENT_TYPE_IDS.includes(eventType as never)) overrides.eventType = eventType;
  const campId = await approveQueueItem(db, id, user.id, { verifiedAgainstSource: formData.get("verified") === "on", overrides });
  await audit(user.id, "queue.approve", "discovery_queue", id, { campId });
  revalidatePath("/admin/discovery");
}

export async function rejectQueue(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const status = formData.get("status") === "duplicate" ? "duplicate" : "rejected";
  const notes = String(formData.get("notes") ?? "").slice(0, 500) || null;
  await db`update discovery_queue set status = ${status}, reviewer_id = ${user.id}, reviewed_at = now(), notes = ${notes} where id = ${id} and status = 'pending'`;
  await audit(user.id, `queue.${status}`, "discovery_queue", id);
  revalidatePath("/admin/discovery");
}

/* ---------------- Source registry ---------------- */
const sourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["college_site", "camp_calendar", "organizer_site", "showcase_site", "licensed_provider", "feed", "api", "csv", "review_platform", "editorial"]),
  adapter: z.enum(["schema_org", "ical", "json_feed", "csv"]),
  base_url: z.string().url().max(500).optional().or(z.literal("")).transform((v) => v || null),
  content_rights: z.enum(["facts_only", "licensed_display", "licensed_excerpt", "link_only", "prohibited", "unknown"]),
  terms_notes: z.string().max(2000).optional().transform((v) => v || null),
  license_reference: z.string().max(300).optional().transform((v) => v || null),
  rate_limit_per_minute: z.coerce.number().int().min(1).max(60),
  refresh_interval_hours: z.coerce.number().int().min(1).max(24 * 60),
  config: z.string().max(10000).transform((v, ctx) => {
    try { return v.trim() ? JSON.parse(v) : {}; } catch { ctx.addIssue({ code: "custom", message: "Config must be valid JSON" }); return z.NEVER; }
  }),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Serializes a source row for postgres.js (config is jsonb). */
function dbRow(row: Record<string, any>): Record<string, any> {
  return { ...row, config: JSON.stringify(row.config ?? {}) };
}

export async function saveSource(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = formData.get("id") ? uuid.parse(formData.get("id")) : null;
  const data = sourceSchema.parse(Object.fromEntries(formData.entries()));
  if (JSON.stringify(data.config).match(/"(api_?key|token|secret|password)"\s*:/i)) {
    throw new Error("Do not store credentials in source config. Reference an env var with authEnv instead.");
  }
  const row = {
    ...data,
    enabled: formData.get("enabled") === "on",
    respects_robots: true,
    terms_reviewed_at: formData.get("terms_reviewed") === "on" ? new Date().toISOString() : null,
  };
  if (id) {
    // Keep the original review date if the box stays ticked.
    const [prev] = await db<{ terms_reviewed_at: string | null }[]>`select terms_reviewed_at from sources where id = ${id}`;
    if (row.terms_reviewed_at && prev?.terms_reviewed_at) row.terms_reviewed_at = prev.terms_reviewed_at;
    await db`update sources set ${db(dbRow(row))} where id = ${id}`;
  } else {
    await db`insert into sources ${db(dbRow({ ...row, created_by: user.id }))}`;
  }
  await audit(user.id, id ? "source.update" : "source.create", "sources", id, { name: data.name, rights: data.content_rights });
  revalidatePath("/admin/sources");
  redirect("/admin/sources");
}

export async function runSourceNow(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const [data] = await db`select * from sources where id = ${id}`;
  if (!data) throw new Error("Source not found");
  const r = await runSource(mapSourceRow(data), makeIngestionStore(db), { triggeredBy: "admin" });
  await audit(user.id, "source.run", "sources", id, { status: r.status, queued: r.queued });
  revalidatePath("/admin/ingestion");
  redirect(`/admin/ingestion?source=${id}`);
}

/* ---------------- CSV imports ---------------- */
async function readUpload(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file");
  if (file.size > MAX_UPLOAD) throw new Error("CSV must be under 5 MB");
  return await file.text();
}

export async function importCampCsv(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const sourceId = uuid.parse(formData.get("sourceId"));
  const text = await readUpload(formData);
  const [src] = await db`select * from sources where id = ${sourceId}`;
  if (!src) throw new Error("Source not found");
  const source = mapSourceRow(src);
  if (source.contentRights === "prohibited" || source.contentRights === "unknown" || !source.termsReviewedAt) {
    throw new Error("Set this source's content rights and review its license before importing.");
  }
  const { errors } = csvRowsToCandidates(text);
  const store = makeIngestionStore(db);
  const r = await runSource({ ...source, adapter: "csv" }, store, { triggeredBy: "csv", inlineContent: text });
  await audit(user.id, "import.camps_csv", "sources", sourceId, { status: r.status, queued: r.queued, errors: errors.length });
  redirect(`/admin/ingestion?source=${sourceId}`);
}

export async function importExternalReviewCsv(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const sourceId = uuid.parse(formData.get("sourceId"));
  const text = await readUpload(formData);
  const [src] = await db`select * from sources where id = ${sourceId}`;
  if (!src) throw new Error("Source not found");
  if (src.content_rights === "prohibited" || src.content_rights === "unknown" || !src.terms_reviewed_at) {
    throw new Error("Review this source's license and set content rights before importing reviews.");
  }
  const rights = defaultRightsForSource(src.content_rights);
  const { rows, errors } = parseExternalReviewCsv(text);
  const campRows = await db`select id, name, sport, organizer_name, institution_name, organizer_id, city, state, start_date from camp_directory limit 20000`;
  const camps = campRows.map((c) => ({ id: c.id, name: c.name, sport: c.sport, organizerName: c.organizer_name, institutionName: c.institution_name, city: c.city, state: c.state, startDate: c.start_date, organizerId: c.organizer_id }));
  let inserted = 0;
  let unmatched = 0;
  for (const r of rows) {
    const best = bestCampMatch({ referencedName: r.referencedName, organizer: r.organizer, sport: r.sport, reviewDate: r.reviewDate, city: r.city, state: r.state }, camps);
    if (!best || best.confidence < 0.3) { unmatched++; continue; }
    const camp = camps.find((c) => c.id === best.camp.id)!;
    try {
      await db`insert into external_reviews ${db({
        source_id: sourceId, platform_name: r.platformName, source_url: r.sourceUrl, provenance_type: r.provenanceType,
        camp_id: camp.id, organizer_id: camp.organizerId ?? null, referenced_name: r.referencedName, sport: r.sport ?? null,
        review_date: r.reviewDate ?? null, rating: r.rating ?? null, rating_scale: r.ratingScale ?? null,
        rating_display_permitted: rights.ratingDisplayPermitted, excerpt: rights.excerptPermitted ? r.excerpt ?? null : null,
        excerpt_permitted: rights.excerptPermitted, reviewer_display: null, reviewer_display_permitted: false,
        attribution: r.attribution, rights_status: rights.rightsStatus, match_confidence: best.confidence, match_method: best.method ?? null,
        status: "pending",
      } as Record<string, any>)}`;
      inserted++;
    } catch (e) {
      console.error("external review import row failed:", (e as Error).message);
    }
  }
  await audit(user.id, "import.external_reviews_csv", "sources", sourceId, { inserted, unmatched, errors: errors.length });
  redirect(`/admin/external-reviews?imported=${inserted}&unmatched=${unmatched}&errors=${errors.length}`);
}

/* ---------------- Camps ---------------- */
export async function updateCamp(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const patch: Record<string, unknown> = {};
  const sport = String(formData.get("sport") ?? "");
  if (SPORT_IDS.includes(sport as never)) patch.sport = sport;
  const status = String(formData.get("status") ?? "");
  if (["draft", "published", "archived", "cancelled"].includes(status)) patch.status = status;
  if (formData.get("markVerified") === "on") { patch.last_verified_at = new Date().toISOString(); patch.verification_status = "verified"; }
  if (Object.keys(patch).length) await db`update camps set ${db(patch as Record<string, any>)} where id = ${id}`;
  await audit(user.id, "camp.update", "camps", id, patch);
  revalidatePath("/admin/camps");
}

export async function verifyParticipatingCollege(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const campId = uuid.parse(formData.get("campId"));
  const institutionId = uuid.parse(formData.get("institutionId"));
  const sourceUrl = z.string().url().parse(formData.get("sourceUrl"));
  await db`update camp_participating_colleges set verified = true, source_url = ${sourceUrl} where camp_id = ${campId} and institution_id = ${institutionId}`;
  await audit(user.id, "camp.verify_college", "camps", campId, { institutionId, sourceUrl });
  revalidatePath("/admin/camps");
}

/* ---------------- Community review moderation (moderators) ---------------- */
export async function moderateReview(formData: FormData) {
  const { user, db } = await requireStaff("moderator");
  const id = uuid.parse(formData.get("id"));
  const status = z.enum(["published", "rejected", "removed", "pending"]).parse(formData.get("status"));
  // Only moderation fields change; the database trigger blocks any content edit by non-authors.
  await db`update reviews set status = ${status} where id = ${id}`;
  if (formData.get("resolveReports") === "on") await db`update review_reports set resolved = true where review_id = ${id}`;
  await audit(user.id, `review.${status}`, "reviews", id);
  revalidatePath("/admin/reviews");
}

export async function verifyAttendance(formData: FormData) {
  const { user, db } = await requireStaff("moderator");
  const id = uuid.parse(formData.get("id"));
  const verdict = z.enum(["verified", "rejected"]).parse(formData.get("verdict"));
  const [data] = await db<{ verification_file_path: string | null }[]>`select verification_file_path from reviews where id = ${id}`;
  await db`update reviews set verification = ${verdict}, verification_file_path = null where id = ${id}`;
  // Delete the proof once reviewed — we keep only the outcome.
  if (data?.verification_file_path) await deleteProof(data.verification_file_path).catch((e) => console.error("proof delete failed:", (e as Error).message));
  await audit(user.id, `review.attendance_${verdict}`, "reviews", id);
  revalidatePath("/admin/reviews");
}

/* ---------------- External reviews ---------------- */
export async function reviewExternal(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const decision = z.enum(["approved", "rejected"]).parse(formData.get("decision"));
  const rights = z.enum(["licensed", "permitted", "link_only", "pending_review", "prohibited"]).parse(formData.get("rights_status"));
  if (decision === "approved" && (rights === "pending_review" || rights === "prohibited")) throw new Error("Set permitted rights before approving");
  await db`
    update external_reviews set status = ${decision}, rights_status = ${rights},
      excerpt_permitted = ${formData.get("excerpt_permitted") === "on"},
      rating_display_permitted = ${formData.get("rating_display_permitted") === "on"},
      reviewed_by = ${user.id}, reviewed_at = now()
    where id = ${id}`;
  await audit(user.id, `external_review.${decision}`, "external_reviews", id, { rights });
  revalidatePath("/admin/external-reviews");
}

/* ---------------- Research summaries ---------------- */
export async function generateResearch(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const campId = uuid.parse(formData.get("campId"));
  const tier = z.enum(["free", "insider", "elite"]).parse(formData.get("tier") ?? "insider");
  const [row] = await db`select * from camp_directory where id = ${campId}`;
  if (!row) throw new Error("Camp not found");
  const [colleges, coaches, ext] = await Promise.all([
    db`select cpc.verified, cpc.source_url, json_build_object('name', i.name) as institutions
       from camp_participating_colleges cpc join institutions i on i.id = cpc.institution_id where cpc.camp_id = ${campId}`,
    db`select coach_name, title, verified, source_url from camp_coaches where camp_id = ${campId}`,
    db`select * from external_reviews_public where camp_id = ${campId} limit 8`,
  ]);
  const camp = mapDetailRow(row, [...colleges], [...coaches]);
  const facts = buildResearchFacts(camp, ext.map(mapExternalPublicRow));
  const draft = await draftResearchSummary(camp, facts);
  await db`
    insert into research_summaries (camp_id, summary, considerations, facts, method, model, access_tier, status)
    values (${campId}, ${draft.summary}, ${JSON.stringify(draft.considerations)}::jsonb, ${JSON.stringify(facts)}::jsonb,
            ${draft.method}, ${draft.model ?? null}, ${tier}, 'draft')`;
  await audit(user.id, "research.generate", "camps", campId, { method: draft.method });
  revalidatePath("/admin/research");
}

export async function reviewResearch(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const decision = z.enum(["approved", "rejected"]).parse(formData.get("decision"));
  const summary = String(formData.get("summary") ?? "").trim();
  const patch: Record<string, unknown> = { status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_notes: String(formData.get("notes") ?? "").slice(0, 1000) || null };
  if (summary) patch.summary = summary.slice(0, 4000);
  await db`update research_summaries set ${db(patch as Record<string, any>)} where id = ${id}`;
  await audit(user.id, `research.${decision}`, "research_summaries", id);
  revalidatePath("/admin/research");
}

/* ---------------- Plans ---------------- */
export async function updatePlan(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = z.string().min(1).max(40).parse(formData.get("id"));
  const features = formData.getAll("features").map(String).filter((f) => f in FEATURES);
  const patch = {
    name: z.string().min(2).max(80).parse(formData.get("name")),
    tagline: String(formData.get("tagline") ?? "").slice(0, 200) || null,
    price_cents: Math.round(z.coerce.number().min(0).max(100000).parse(formData.get("price")) * 100),
    billing_interval: z.enum(["month", "year"]).parse(formData.get("billing_interval")),
    stripe_price_id: String(formData.get("stripe_price_id") ?? "").trim() || null,
    athlete_market_product_key: String(formData.get("athlete_market_product_key") ?? "").trim() || null,
    highlights: String(formData.get("highlights") ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 10),
    features,
    active: formData.get("active") === "on",
    updated_at: new Date().toISOString(),
  };
  if (patch.stripe_price_id && !/^price_[A-Za-z0-9]+$/.test(patch.stripe_price_id)) throw new Error("Stripe price IDs start with price_");
  await db`update plans set ${db(patch as Record<string, any>)} where id = ${id}`;
  await audit(user.id, "plan.update", "plans", id, { price_cents: patch.price_cents, stripe_price_id: patch.stripe_price_id });
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}

/* ---------------- Entitlements ---------------- */
async function findUserId(db: Awaited<ReturnType<typeof requireStaff>>["db"], idOrEmail: string): Promise<string | null> {
  const v = idOrEmail.trim();
  const [hit] = uuid.safeParse(v).success
    ? await db<{ id: string }[]>`select id from users where id = ${v}`
    : await db<{ id: string }[]>`select id from users where lower(email) = lower(${v})`;
  return hit?.id ?? null;
}

export async function grantEntitlement(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const target = await findUserId(db, String(formData.get("user") ?? ""));
  if (!target) redirect("/admin/entitlements?error=user");
  const planId = z.string().min(1).parse(formData.get("planId"));
  const days = z.coerce.number().int().min(1).max(3650).parse(formData.get("days"));
  const ref = `admin:${user.id}:${Date.now()}`;
  await db`
    insert into entitlements (user_id, plan_id, source, source_ref, expires_at, notes)
    values (${target}, ${planId}, 'admin', ${ref}, ${new Date(Date.now() + days * 86400_000).toISOString()},
            ${String(formData.get("notes") ?? "").slice(0, 500) || null})`;
  await audit(user.id, "entitlement.grant", "entitlements", target, { planId, days });
  redirect(`/admin/entitlements?user=${target}`);
}

export async function revokeEntitlement(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const id = uuid.parse(formData.get("id"));
  const [data] = await db<{ user_id: string }[]>`update entitlements set revoked_at = now() where id = ${id} returning user_id`;
  await audit(user.id, "entitlement.revoke", "entitlements", id);
  redirect(`/admin/entitlements${data ? `?user=${data.user_id}` : ""}`);
}

/* Manual single-candidate entry from the admin queue page. */
export async function addManualCandidate(formData: FormData) {
  const { user, db } = await requireStaff("admin");
  const store = makeIngestionStore(db);
  const runId = await store.startRun(null, "admin");
  const { items } = prepareQueueItems([{
    name: String(formData.get("name") ?? ""), sport: String(formData.get("sport") ?? ""), startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""), city: String(formData.get("city") ?? ""), state: String(formData.get("state") ?? ""),
    institution: String(formData.get("institution") ?? ""), organizer: String(formData.get("organizer") ?? ""),
    price: String(formData.get("price") ?? ""), registrationUrl: String(formData.get("registrationUrl") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""), description: String(formData.get("description") ?? ""),
  }], { sourceId: null, runId, fallbackUrl: null, existing: await store.existingCamps(), pendingFingerprints: await store.pendingFingerprints(), submittedBy: user.id });
  const queued = items.length ? await store.enqueue(items) : 0;
  await store.finishRun(runId, { status: queued ? "succeeded" : "partial", found: 1, queued, skipped: 1 - queued, error: queued ? null : "Missing name or source URL, or a duplicate is already pending", log: [] });
  revalidatePath("/admin/discovery");
}
