import { getSql } from "@/lib/db";
import { storageConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { getSessionUser } from "@/lib/server/auth";
import { json, sameOrigin } from "@/lib/server/http";
import { deleteProof, putProof } from "@/lib/storage/proofs";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX = 5 * 1024 * 1024;

/** Optional attendance verification: private upload visible only to moderators (via short-lived signed links). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const sql = getSql();
  if (!sql || !storageConfigured()) return json({ error: "Unavailable" }, 503);
  const user = await getSessionUser();
  if (!user) return json({ error: "Sign in required" }, 401);
  if (!rateLimit(`proof:${user.id}`, 10, 3600_000).ok) return json({ error: "Too many uploads" }, 429);

  const form = await req.formData();
  const reviewId = String(form.get("reviewId") ?? "");
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return json({ error: "Review not found" }, 404);
  if (!(file instanceof File)) return json({ error: "No file" }, 400);
  const ext = TYPES[file.type];
  if (!ext || file.size > MAX) return json({ error: "Use a JPG, PNG, WebP or PDF under 5 MB" }, 400);

  // Ownership check (formerly RLS): only the review's author may attach proof.
  const [review] = await sql<{ id: string; user_id: string; verification_file_path: string | null }[]>`
    select id, user_id, verification_file_path from reviews where id = ${reviewId}`;
  if (!review || review.user_id !== user.id) return json({ error: "Review not found" }, 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Verify magic bytes so the declared type matches the content.
  const sig = Array.from(bytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const okSig = (ext === "jpg" && sig.startsWith("ffd8")) || (ext === "png" && sig === "89504e47") || (ext === "pdf" && sig === "25504446") || (ext === "webp" && sig === "52494646");
  if (!okSig) return json({ error: "File content doesn't match its type" }, 400);

  const key = `attendance-proofs/${user.id}/${reviewId}-${Date.now()}.${ext}`;
  try {
    await putProof(key, bytes, file.type);
  } catch (e) {
    console.error("proof upload failed:", (e as Error).message);
    return json({ error: "Upload failed" }, 500);
  }
  // Moderation fields only (the content guard allows non-content updates).
  await sql`update reviews set verification = 'pending', verification_file_path = ${key} where id = ${reviewId}`;
  if (review.verification_file_path) await deleteProof(review.verification_file_path).catch(() => {});
  return json({ ok: true });
}
