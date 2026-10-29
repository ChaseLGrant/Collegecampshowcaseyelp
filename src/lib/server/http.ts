import "server-only";
import { NextResponse } from "next/server";
import { env } from "../env";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** CSRF defense for JSON/form POSTs from browsers: require a same-origin Origin header. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env.siteUrl).origin;
  } catch {
    return false;
  }
}
