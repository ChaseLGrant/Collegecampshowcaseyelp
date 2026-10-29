import { z } from "zod";
import { getSql, isUniqueViolation } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { getSessionUser } from "@/lib/server/auth";
import { json, sameOrigin } from "@/lib/server/http";

const schema = z.object({
  reviewId: z.string().uuid(),
  reason: z.enum(["spam", "fake", "offensive", "conflict_of_interest", "other"]),
  details: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const sql = getSql();
  if (!sql) return json({ error: "Unavailable" }, 503);
  const user = await getSessionUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`report:${user.id}`, 20, 3600_000).ok) return json({ error: "Too many reports" }, 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid report" }, 400);
  try {
    await sql`
      insert into review_reports (review_id, reporter_id, reason, details)
      select ${parsed.data.reviewId}, ${user.id}, ${parsed.data.reason}, ${parsed.data.details ?? null}
      where exists (select 1 from reviews where id = ${parsed.data.reviewId} and status = 'published')`;
  } catch (e) {
    if (!isUniqueViolation(e)) return json({ error: "Could not save report" }, 500);
  }
  return json({ ok: true });
}
