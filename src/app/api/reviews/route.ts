import { reviewInputSchema, assessSpam, bodyFingerprint } from "@/lib/reviews/validation";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { hashIp } from "@/lib/security/hmac";
import { json, sameOrigin } from "@/lib/server/http";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const ip = clientIp(req.headers);
  if (!rateLimit(`review:ip:${ip}`, 10, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);

  const db = await getServerSupabase();
  if (!db) return json({ error: "Reviews are not available until the database is configured." }, 503);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`review:user:${auth.user.id}`, 5, 3600_000).ok) return json({ error: "Too many submissions. Try again later." }, 429);

  const parsed = reviewInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ errors: parsed.error.issues.map((i) => i.message) }, 400);
  const input = parsed.data;

  const { data: camp } = await db.from("camps").select("id,status").eq("id", input.campId).maybeSingle();
  if (!camp || camp.status !== "published") return json({ error: "Camp not found" }, 404);

  const fingerprint = bodyFingerprint(input.body);
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count: recent } = await db.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).gte("created_at", since);
  const service = getServiceSupabase();
  let duplicateBodyExists = false;
  if (service) {
    const { count } = await service.from("reviews").select("id", { count: "exact", head: true }).eq("body_fingerprint", fingerprint);
    duplicateBodyExists = (count ?? 0) > 0;
  }
  const spam = assessSpam(input, { recentReviewsByUser: recent ?? 0, duplicateBodyExists });
  if (spam.decision === "reject") {
    return json({ error: "We couldn't accept this review. Reviews must be original, first-hand and free of links or promotions." }, 422);
  }

  await db.from("profiles").update({ age_confirmed_at: new Date().toISOString() }).eq("id", auth.user.id).is("age_confirmed_at", null);

  const status = spam.decision === "publish" ? "published" : "pending";
  const { data, error } = await db.from("reviews").insert({
    camp_id: input.campId,
    user_id: auth.user.id,
    attendee_role: input.attendeeRole,
    attended_year: input.attendedYear ?? null,
    rating_value: input.ratings.value,
    rating_instruction: input.ratings.instruction,
    rating_exposure: input.ratings.exposure,
    rating_organization: input.ratings.organization,
    rating_overall: input.ratings.overall,
    title: input.title,
    body: input.body,
    would_recommend: input.wouldRecommend ?? null,
    status,
    spam_score: spam.score,
    body_fingerprint: fingerprint,
    ip_hash: hashIp(ip, process.env.IP_HASH_SALT ?? "campgrade"),
  }).select("id,status").single();

  if (error) {
    if (error.code === "23505") return json({ error: "You've already reviewed this camp. You can edit your review from your account." }, 409);
    return json({ error: "Could not save review" }, 500);
  }
  return json({ id: data.id, status: data.status }, 201);
}
