import { NextResponse } from "next/server";
import { signOut } from "@/auth";
import { authConfigured } from "@/lib/env";
import { sameOrigin } from "@/lib/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  if (authConfigured()) await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
