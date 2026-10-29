import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSupabase, getServiceSupabase } from "../supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
  role: "user" | "moderator" | "admin";
  ageConfirmed: boolean;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const db = await getServerSupabase();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db.from("profiles").select("role,age_confirmed_at").eq("id", data.user.id).maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: (profile?.role as SessionUser["role"]) ?? "user",
    ageConfirmed: Boolean(profile?.age_confirmed_at),
  };
});

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return u;
}

/** For admin pages and actions. Returns the service client only after the role check passes. */
export async function requireStaff(minRole: "moderator" | "admin" = "admin") {
  const u = await getSessionUser();
  if (!u) redirect("/login?next=/admin");
  const ok = minRole === "moderator" ? u.role === "admin" || u.role === "moderator" : u.role === "admin";
  if (!ok) redirect("/");
  const db = getServiceSupabase();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  return { user: u, db };
}

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const db = getServiceSupabase();
  if (!db) return;
  await db.from("audit_log").insert({ actor_id: actorId, action, entity, entity_id: entityId, details });
}
