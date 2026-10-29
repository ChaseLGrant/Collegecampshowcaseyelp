import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/server/http";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Bad origin", { status: 403 });
  const db = await getServerSupabase();
  await db?.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
