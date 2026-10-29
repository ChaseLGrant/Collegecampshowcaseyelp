import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Signature scheme for server-to-server calls with The Athlete Market:
 *  signature = hex(HMAC_SHA256(secret, `${timestamp}.${method}.${path}.${sha256(body)}`))
 *  Headers: X-CG-Timestamp (unix seconds), X-CG-Signature. Max clock skew: 5 minutes. */
export const MAX_SKEW_SECONDS = 300;

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function signRequest(secret: string, ts: number, method: string, path: string, body = ""): string {
  return createHmac("sha256", secret).update(`${ts}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function verifyRequest(opts: {
  secret: string; timestamp: string | null; signature: string | null;
  method: string; path: string; body?: string; now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!opts.secret) return { ok: false, reason: "not configured" };
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: "missing signature" };
  const ts = Number(opts.timestamp);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale timestamp" };
  const expected = signRequest(opts.secret, ts, opts.method, opts.path, opts.body ?? "");
  return safeEqualHex(expected, opts.signature) ? { ok: true } : { ok: false, reason: "bad signature" };
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
