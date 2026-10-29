import { rateLimit } from "@/lib/security/rate-limit";
import { json, sameOrigin } from "@/lib/server/http";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX = 5 * 1024 * 1024;

/** Optional attendance verification: private upload visible only to the author and moderators. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const db = await getServerSupabase();
  const service = getServiceSupabase();
  if (!db || !service) return json({ error: "Unavailable" }, 503);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`proof:${auth.user.id}`, 10, 3600_000).ok) return json({ error: "Too many uploads" }, 429);

  const form = await req.formData();
  const reviewId = String(form.get("reviewId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "No file" }, 400);
  const ext = TYPES[file.type];
  if (!ext || file.size > MAX) return json({ error: "Use a JPG, PNG, WebP or PDF under 5 MB" }, 400);

  const { data: review } = await db.from("reviews").select("id,user_id").eq("id", reviewId).maybeSingle();
  if (!review || review.user_id !== auth.user.id) return json({ error: "Review not found" }, 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Verify magic bytes so the declared type matches the content.
  const sig = Array.from(bytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const okSig = (ext === "jpg" && sig.startsWith("ffd8")) || (ext === "png" && sig === "89504e47") || (ext === "pdf" && sig === "25504446") || (ext === "webp" && sig === "52494646");
  if (!okSig) return json({ error: "File content doesn't match its type" }, 400);

  const path = `${auth.user.id}/${reviewId}-${Date.now()}.${ext}`;
  const up = await db.storage.from("attendance-proofs").upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) return json({ error: "Upload failed" }, 500);
  // Moderation fields are written with the service role (the content guard allows non-content updates).
  await service.from("reviews").update({ verification: "pending", verification_file_path: path }).eq("id", reviewId);
  return json({ ok: true });
}
