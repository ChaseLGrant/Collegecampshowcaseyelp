import { asUser, getSql, isUniqueViolation } from "@/lib/db";
import { reviewInputSchema, assessSpam, bodyFingerprint } from "@/lib/reviews/validation";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { hashIp } from "@/lib/security/hmac";
import { getSessionUser } from "@/lib/server/auth";
import { json, sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const ip = clientIp(req.headers);
  if (!rateLimit(`review:ip:${ip}`, 10, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);

  const sql = getSql();
  if (!sql) return json({ error: "Reviews are not available until the database is configured." }, 503);
  const user = await getSessionUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`review:user:${user.id}`, 5, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);

  const parsed = reviewInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ errors: parsed.error.issues.map((i) => i.message) }, 400);
  const input = parsed.data;

  const [camp] = await sql<{ id: string; status: string }[]>`select id, status from camps where id = ${input.campId}`;
  if (!camp || camp.status !== "published") return json({ error: "Camp not found" }, 404);

  const fingerprint = bodyFingerprint(input.body);
  const [{ recent, dup }] = await sql<{ recent: number; dup: boolean }[]>`
    select (select count(*)::int from reviews where user_id = ${user.id} and created_at >= now() - interval '1 day') as recent,
           exists (select 1 from reviews where body_fingerprint = ${fingerprint}) as dup`;
  const spam = assessSpam(input, { recentReviewsByUser: recent, duplicateBodyExists: dup });
  if (spam.decision === "reject") {
    return json({ error: "We couldn't accept this review. Reviews must be original, first-hand and free of links or promotions." }, 422);
  }

  const status = spam.decision === "publish" ? "published" : "pending";
  try {
    // Review content is written as its author (app.user_id) — the database guard rejects anything else.
    const row = await asUser(user.id, async (tx) => {
      await tx`update profiles set age_confirmed_at = now() where id = ${user.id} and age_confirmed_at is null`;
      const [r] = await tx<{ id: string; status: string }[]>`
        insert into reviews (camp_id, user_id, attendee_role, attended_year, rating_value, rating_instruction, rating_exposure,
          rating_organization, rating_overall, title, body, would_recommend, status, spam_score, body_fingerprint, ip_hash)
        values (${input.campId}, ${user.id}, ${input.attendeeRole}, ${input.attendedYear ?? null}, ${input.ratings.value},
          ${input.ratings.instruction}, ${input.ratings.exposure}, ${input.ratings.organization}, ${input.ratings.overall},
          ${input.title}, ${input.body}, ${input.wouldRecommend ?? null}, ${status}, ${spam.score}, ${fingerprint},
          ${hashIp(ip, process.env.IP_HASH_SALT ?? "campgrade")})
        returning id, status`;
      return r;
    });
    return json({ id: row.id, status: row.status }, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return json({ error: "You've already reviewed this camp. You can edit your review from your account." }, 409);
    console.error("review insert failed:", (e as Error).message);
    return json({ error: "Could not save review" }, 500);
  }
}
