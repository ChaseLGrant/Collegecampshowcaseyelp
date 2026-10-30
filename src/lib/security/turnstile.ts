/**
 * Optional Cloudflare Turnstile layer. Active only when BOTH NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * and TURNSTILE_SECRET_KEY are set; otherwise every check is skipped silently.
 * Kept free of server-only imports so it can be unit tested.
 */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Env = Record<string, string | undefined>;

export function turnstileSecret(env: Env = process.env): string | null {
  const site = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  return site && secret ? secret : null;
}

export function turnstileEnabled(env: Env = process.env): boolean {
  return turnstileSecret(env) !== null;
}

export interface TurnstileResult {
  ok: boolean;
  skipped?: boolean;
  errorCodes?: string[];
}

/**
 * Verifies a Turnstile token server-side. Missing/invalid tokens fail; a network error or a
 * non-200 from Cloudflare also fails (closed) — the visitor can simply retry the challenge.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  opts: { remoteIp?: string | null; env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<TurnstileResult> {
  const secret = turnstileSecret(opts.env ?? process.env);
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string" || token.length > 2048) return { ok: false, errorCodes: ["missing-input-response"] };
  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp && opts.remoteIp !== "unknown") body.set("remoteip", opts.remoteIp);
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    return data.success === true ? { ok: true } : { ok: false, errorCodes: data["error-codes"] ?? [] };
  } catch {
    return { ok: false, errorCodes: ["network-error"] };
  }
}

export const TURNSTILE_FAILED_MESSAGE = "Please complete the quick \u201cverify you\u2019re human\u201d check and submit again.";
