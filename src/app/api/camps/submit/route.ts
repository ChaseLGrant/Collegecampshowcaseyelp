import { z } from "zod";
import { makeIngestionStore } from "@/lib/admin/ingestion-store";
import { prepareQueueItems } from "@/lib/ingestion/pipeline";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { safeHttpUrl } from "@/lib/security/urls";
import { json, sameOrigin } from "@/lib/server/http";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(3).max(200),
  sport: z.string().max(20),
  startDate: z.string().max(10).optional(),
  sourceUrl: z.string().url().max(500),
  organizer: z.string().max(160).optional(),
  location: z.string().max(120).optional(),
  price: z.string().max(60).optional(),
  website: z.string().max(0).optional().or(z.literal("")),
  elapsedMs: z.number().optional(),
});

/** Community camp submissions go to the admin discovery queue — never straight to the directory. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  if (!rateLimit(`submit:${clientIp(req.headers)}`, 5, 3600_000).ok) return json({ error: "Too many submissions" }, 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Please check the form fields." }, 400);
  const d = parsed.data;
  if (d.website || (d.elapsedMs != null && d.elapsedMs < 3000)) return json({ ok: true }); // silently drop bots
  if (!safeHttpUrl(d.sourceUrl)) return json({ error: "Please use an http(s) link." }, 400);
  const db = getServiceSupabase();
  if (!db) return json({ error: "Submissions open once the database is configured." }, 503);

  const user = (await (await getServerSupabase())?.auth.getUser())?.data.user ?? null;
  const [city, state] = (d.location ?? "").split(",").map((s) => s.trim());
  const store = makeIngestionStore(db);
  const { data: manual } = await db.from("sources").select("id").eq("kind", "manual").limit(1).maybeSingle();
  const runId = await store.startRun(manual?.id ?? null, "submission");
  const { items } = prepareQueueItems([{
    name: d.name, sport: d.sport, startDate: d.startDate, sourceUrl: d.sourceUrl, registrationUrl: d.sourceUrl,
    organizer: d.organizer, city, state, price: d.price,
  }], { sourceId: manual?.id ?? null, runId, fallbackUrl: null, existing: await store.existingCamps(), pendingFingerprints: await store.pendingFingerprints(), submittedBy: user?.id ?? null });
  const queued = items.length ? await store.enqueue(items) : 0;
  await store.finishRun(runId, { status: "succeeded", found: 1, queued, skipped: 1 - queued, error: null, log: [] });
  return json({ ok: true });
}
