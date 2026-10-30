import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveQueueItem } from "@/lib/admin/approve";
import { makeIngestionStore } from "@/lib/admin/ingestion-store";
import { prepareQueueItems } from "@/lib/ingestion/pipeline";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { safeHttpUrl } from "@/lib/security/urls";
import { isSportId } from "@/lib/sports";
import { json, sameOrigin } from "@/lib/server/http";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";
import { rejectIfBot } from "@/lib/security/bot";
import { TURNSTILE_FAILED_MESSAGE, turnstileEnabled, verifyTurnstile } from "@/lib/security/turnstile";

const schema = z.object({
  name: z.string().trim().min(3).max(200),
  sport: z.string().max(20).refine(isSportId, "Choose a sport"),
  startDate: z.string().max(10).optional(),
  sourceUrl: z.string().url().max(500),
  organizer: z.string().max(160).optional(),
  location: z.string().max(120).optional(),
  price: z.string().max(60).optional(),
  website: z.string().max(0).optional().or(z.literal("")),
  elapsedMs: z.number().optional(),
  turnstileToken: z.string().max(2048).optional(),
});

/**
 * Community camp submissions publish immediately (no admin approval), marked
 * "unverified". They still pass through the discovery queue so every listing keeps
 * its provenance, and admins can hide or remove a camp afterwards from /admin.
 * A submission that matches an existing camp never creates a duplicate and never
 * overwrites the existing listing; it stays in the queue for an admin to merge.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const bot = await rejectIfBot();
  if (bot) return bot;
  const ip = clientIp(req.headers);
  if (!rateLimit(`submit:${ip}`, 5, 3600_000).ok) return json({ error: "Too many submissions" }, 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Please check the form fields." }, 400);
  const d = parsed.data;
  if (d.website || (d.elapsedMs != null && d.elapsedMs < 3000)) return json({ ok: true }); // silently drop bots
  if (turnstileEnabled()) {
    const ts = await verifyTurnstile(d.turnstileToken, { remoteIp: ip });
    if (!ts.ok) return json({ error: TURNSTILE_FAILED_MESSAGE }, 403);
  }
  if (!safeHttpUrl(d.sourceUrl)) return json({ error: "Please use an http(s) link." }, 400);
  const db = getSql();
  if (!db) return json({ error: "Submissions open once the database is configured." }, 503);

  const user = await getSessionUser();
  const [city, state] = (d.location ?? "").split(",").map((s) => s.trim());
  const store = makeIngestionStore(db);
  const [manual] = await db<{ id: string }[]>`select id from sources where kind = 'manual' limit 1`;
  const runId = await store.startRun(manual?.id ?? null, "submission");
  const { items } = prepareQueueItems([{
    name: d.name, sport: d.sport, startDate: d.startDate, sourceUrl: d.sourceUrl, registrationUrl: d.sourceUrl,
    organizer: d.organizer, city, state, price: d.price,
  }], { sourceId: manual?.id ?? null, runId, fallbackUrl: null, existing: await store.existingCamps(), pendingFingerprints: await store.pendingFingerprints(), submittedBy: user?.id ?? null });
  const queued = items.length ? await store.enqueue(items) : 0;
  await store.finishRun(runId, { status: "succeeded", found: 1, queued, skipped: 1 - queued, error: null, log: [] });

  const item = items[0];
  if (!item || !queued) return json({ ok: true, published: false }); // already submitted (same event pending)

  if (item.kind === "camp_update" && item.matchedCampId) {
    // Same event as an existing listing: no duplicate, and no anonymous overwrite of its facts.
    const [existing] = await db<{ slug: string }[]>`select slug from camps where id = ${item.matchedCampId} and status = 'published'`;
    return json({ ok: true, published: false, existing: true, slug: existing?.slug ?? null });
  }

  try {
    const [row] = await db<{ id: string }[]>`
      select id from discovery_queue where run_id = ${runId} and fingerprint = ${item.fingerprint} and status = 'pending' limit 1`;
    if (!row) return json({ ok: true, published: false });
    const campId = await db.begin((tx) => approveQueueItem(tx, row.id, null, { verifiedAgainstSource: false }));
    const [camp] = await db<{ slug: string }[]>`select slug from camps where id = ${campId}`;
    try { revalidatePath("/"); } catch { /* not in a request scope */ }
    return json({ ok: true, published: true, slug: camp?.slug ?? null });
  } catch (e) {
    // The item stays pending in the discovery queue, so nothing is lost; an admin can publish it.
    console.error("auto-publish failed:", (e as Error).message);
    return json({ ok: true, published: false });
  }
}
