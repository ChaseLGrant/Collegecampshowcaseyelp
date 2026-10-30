import { randomUUID } from "node:crypto";
import { asUser, getSql, isUniqueViolation } from "@/lib/db";
import { guestEmailFor, guestFieldsSchema, shortDisplayName } from "@/lib/reviews/guest";
import { reviewInputSchema, assessSpam, bodyFingerprint } from "@/lib/reviews/validation";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { hashIp } from "@/lib/security/hmac";
import { getSessionUser } from "@/lib/server/auth";
import { json, sameOrigin } from "@/lib/server/http";

const schema = reviewInputSchema.merge(guestFieldsSchema);

/** Guest reviews allowed per IP per day (enforced in memory and, durably, against the database). */
const GUEST_DAILY_CAP = 5;

const REJECTED = "We couldn't accept this review. Reviews must be original, first-hand and free of links or promotions.";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const ip = clientIp(req.headers);
  if (!rateLimit(`review:ip:${ip}`, 10, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);

  const sql = getSql();
  if (!sql) return json({ error: "Reviews are not available until the database is configured." }, 503);
  const user = await getSessionUser();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ errors: parsed.error.issues.map((i) => i.message) }, 400);
  const input = parsed.data;
  const ipHash = hashIp(ip, process.env.IP_HASH_SALT ?? "campgrade");

  if (user) {
    if (!rateLimit(`review:user:${user.id}`, 5, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);
  } else {
    if (!input.guestName) return json({ errors: ["Add your name so other families know who wrote the review."] }, 400);
    if (!rateLimit(`review:guest:${ip}`, GUEST_DAILY_CAP, 24 * 3600_000).ok) return json({ error: "Too many reviews from this connection today. Try again tomorrow." }, 429);
  }

  const [camp] = await sql<{ id: string; status: string }[]>`select id, status from camps where id = ${input.campId}`;
  if (!camp || camp.status !== "published") return json({ error: "Camp not found" }, 404);

  const fingerprint = bodyFingerprint(input.body);
  let recent: number;
  let dup: boolean;
  if (user) {
    [{ recent, dup }] = await sql<{ recent: number; dup: boolean }[]>`
      select (select count(*)::int from reviews where user_id = ${user.id} and created_at >= now() - interval '1 day') as recent,
             exists (select 1 from reviews where body_fingerprint = ${fingerprint}) as dup`;
  } else {
    const [row] = await sql<{ recent: number; dup: boolean; same_camp: boolean }[]>`
      select (select count(*)::int from reviews r join users u on u.id = r.user_id
                where u.is_guest and r.ip_hash = ${ipHash} and r.created_at >= now() - interval '1 day') as recent,
             exists (select 1 from reviews where body_fingerprint = ${fingerprint}) as dup,
             exists (select 1 from reviews r join users u on u.id = r.user_id
                where u.is_guest and r.ip_hash = ${ipHash} and r.camp_id = ${input.campId}) as same_camp`;
    if (row.same_camp) return json({ error: "A review for this camp was already posted from this connection." }, 409);
    if (row.recent >= GUEST_DAILY_CAP) return json({ error: "Too many reviews from this connection today. Try again tomorrow." }, 429);
    ({ recent, dup } = row);
  }
  const spam = assessSpam(input, { recentReviewsByUser: recent, duplicateBodyExists: dup });
  if (spam.decision === "reject") return json({ error: REJECTED }, 422);

  const status = spam.decision === "publish" ? "published" : "pending";
  try {
    if (user) {
      // Review content is written as its author (app.user_id) — the database guard rejects anything else.
      const row = await asUser(user.id, async (tx) => {
        await tx`update profiles set age_confirmed_at = now() where id = ${user.id} and age_confirmed_at is null`;
        const [r] = await tx<{ id: string; status: string }[]>`
          insert into reviews (camp_id, user_id, attendee_role, attended_year, rating_value, rating_instruction, rating_exposure,
            rating_organization, rating_overall, title, body, would_recommend, status, spam_score, body_fingerprint, ip_hash)
          values (${input.campId}, ${user.id}, ${input.attendeeRole}, ${input.attendedYear ?? null}, ${input.ratings.value},
            ${input.ratings.instruction}, ${input.ratings.exposure}, ${input.ratings.organization}, ${input.ratings.overall},
            ${input.title}, ${input.body}, ${input.wouldRecommend ?? null}, ${status}, ${spam.score}, ${fingerprint}, ${ipHash})
          returning id, status`;
        return r;
      });
      return json({ id: row.id, status: row.status, guest: false }, 201);
    }

    // Guest: create a sign-in-proof guest user and its review in ONE transaction, then write the
    // review as that user (app.user_id) so reviews_content_guard still holds.
    const guestName = input.guestName!;
    const displayName = shortDisplayName(guestName) ?? guestName.slice(0, 60);
    const row = await sql.begin(async (tx) => {
      const [g] = await tx<{ id: string }[]>`
        insert into users (email, name, is_guest) values (${guestEmailFor(randomUUID())}, ${guestName}, true) returning id`;
      await tx`update profiles set display_name = ${displayName}, age_confirmed_at = now() where id = ${g.id}`;
      await tx`select set_config('app.user_id', ${g.id}, true)`;
      const [r] = await tx<{ id: string; status: string }[]>`
        insert into reviews (camp_id, user_id, attendee_role, attended_year, rating_value, rating_instruction, rating_exposure,
          rating_organization, rating_overall, title, body, would_recommend, status, spam_score, body_fingerprint, ip_hash,
          guest_name, guest_email)
        values (${input.campId}, ${g.id}, ${input.attendeeRole}, ${input.attendedYear ?? null}, ${input.ratings.value},
          ${input.ratings.instruction}, ${input.ratings.exposure}, ${input.ratings.organization}, ${input.ratings.overall},
          ${input.title}, ${input.body}, ${input.wouldRecommend ?? null}, ${status}, ${spam.score}, ${fingerprint}, ${ipHash},
          ${guestName}, ${input.guestEmail ?? null})
        returning id, status`;
      return r;
    }) as { id: string; status: string };
    return json({ id: row.id, status: row.status, guest: true }, 201);
  } catch (e) {
    if (isUniqueViolation(e)) return json({ error: "You've already reviewed this camp. You can edit your review from your account." }, 409);
    console.error("review insert failed:", (e as Error).message);
    return json({ error: "Could not save review" }, 500);
  }
}
