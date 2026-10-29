import { z } from "zod";
import { rateLimit } from "@/lib/security/rate-limit";
import { json, sameOrigin } from "@/lib/server/http";
import { getServerSupabase } from "@/lib/supabase/server";

const schema = z.object({
  reviewId: z.string().uuid(),
  reason: z.enum(["spam", "fake", "offensive", "conflict_of_interest", "other"]),
  details: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const db = await getServerSupabase();
  if (!db) return json({ error: "Unavailable" }, 503);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`report:${auth.user.id}`, 20, 3600_000).ok) return json({ error: "Too many reports" }, 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid report" }, 400);
  const { error } = await db.from("review_reports").insert({
    review_id: parsed.data.reviewId, reporter_id: auth.user.id, reason: parsed.data.reason, details: parsed.data.details ?? null,
  });
  if (error && error.code !== "23505") return json({ error: "Could not save report" }, 500);
  return json({ ok: true });
}
