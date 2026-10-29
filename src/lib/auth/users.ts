import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSql } from "../db";

// Valid bcrypt hash of a throwaway string, compared when the email is unknown so timing does not reveal accounts.
const DUMMY_HASH = "$2b$12$albJww6GtY4n6hXuDrNsQukixGGxRNWjWEsFxdUXKSVmnbMPf/36O";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(128, "Use 128 characters or fewer.");

export interface DbUser { id: string; email: string; name: string | null; password_hash: string | null }

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const [u] = await requireSql()<DbUser[]>`select id, email, name, password_hash from users where lower(email) = lower(${email})`;
  return u ?? null;
}

export async function createPasswordUser(email: string, password: string, name: string | null): Promise<{ id: string } | "exists"> {
  const hash = await bcrypt.hash(password, 12);
  const rows = await requireSql()<{ id: string }[]>`
    insert into users (email, password_hash, name) values (${email}, ${hash}, ${name})
    on conflict ((lower(email))) do nothing returning id`;
  return rows[0] ?? "exists";
}

/** Verifies email + password. Constant-ish time: always runs one bcrypt compare. */
export async function verifyPassword(email: string, password: string): Promise<DbUser | null> {
  const u = await findUserByEmail(email);
  const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !u.password_hash || !ok) return null;
  await requireSql()`update users set last_sign_in_at = now() where id = ${u.id}`;
  return u;
}

/**
 * Finds or creates the app user for a Google sign-in. Links to an existing
 * email account only when Google says the email is verified.
 */
export async function upsertOAuthUser(p: { provider: string; providerAccountId: string; email: string; emailVerified: boolean; name: string | null; image: string | null }): Promise<string | null> {
  const sql = requireSql();
  const [linked] = await sql<{ user_id: string }[]>`select user_id from user_accounts where provider = ${p.provider} and provider_account_id = ${p.providerAccountId}`;
  if (linked) {
    await sql`update users set last_sign_in_at = now() where id = ${linked.user_id}`;
    return linked.user_id;
  }
  if (!p.emailVerified) return null;
  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from users where lower(email) = lower(${p.email})`;
    const id = existing?.id ?? (await tx<{ id: string }[]>`
      insert into users (email, email_verified_at, name, image) values (${p.email}, now(), ${p.name}, ${p.image}) returning id`)[0].id;
    if (existing) await tx`update users set email_verified_at = coalesce(email_verified_at, now()), last_sign_in_at = now() where id = ${id}`;
    await tx`insert into user_accounts (provider, provider_account_id, user_id) values (${p.provider}, ${p.providerAccountId}, ${id}) on conflict do nothing`;
    return id;
  }) as Promise<string>;
}
