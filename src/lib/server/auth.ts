import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { getSql, requireSql, type Sql } from "../db";
import { authConfigured } from "../env";

export interface SessionUser {
  id: string;
  email: string | null;
  role: "user" | "moderator" | "admin";
  ageConfirmed: boolean;
}

/** The signed-in user, verified against Postgres on every request (deleted users and role changes apply immediately). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!authConfigured()) return null;
  const session = await auth().catch(() => null);
  const id = session?.user?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = getSql();
  if (!sql) return null;
  const [row] = await sql<{ id: string; email: string; role: SessionUser["role"] | null; age_confirmed_at: string | null }[]>`
    select u.id, u.email, p.role, p.age_confirmed_at from users u left join profiles p on p.id = u.id where u.id = ${id}`;
  if (!row) return null;
  return { id: row.id, email: row.email, role: row.role ?? "user", ageConfirmed: Boolean(row.age_confirmed_at) };
});

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return u;
}

export function isStaff(u: SessionUser | null, minRole: "moderator" | "admin" = "admin"): boolean {
  if (!u) return false;
  return minRole === "moderator" ? u.role === "admin" || u.role === "moderator" : u.role === "admin";
}

/** For admin pages and actions. Returns the database handle only after the role check passes. */
export async function requireStaff(minRole: "moderator" | "admin" = "admin"): Promise<{ user: SessionUser; db: Sql }> {
  const u = await getSessionUser();
  if (!u) redirect("/login?next=/admin");
  if (!isStaff(u, minRole)) redirect("/");
  return { user: u, db: requireSql() };
}

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const sql = getSql();
  if (!sql) return;
  await sql`insert into audit_log (actor_id, action, entity, entity_id, details) values (${actorId}, ${action}, ${entity}, ${entityId}, ${sql.json(details as never)})`;
}
