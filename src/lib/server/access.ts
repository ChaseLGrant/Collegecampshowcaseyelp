import "server-only";
import { cache } from "react";
import { FREE_ACCESS, resolveAccess, type AccessSummary, type EntitlementRecord } from "../billing/entitlements";
import { DEFAULT_PLANS, mapPlanRow, type Plan } from "../billing/plans";
import { getSql } from "../db";
import { getSessionUser } from "./auth";

export const getPlans = cache(async (): Promise<Plan[]> => {
  const sql = getSql();
  if (!sql) return DEFAULT_PLANS;
  try {
    const rows = await sql`select * from plans where active order by sort_order`;
    return rows.length ? rows.map(mapPlanRow) : DEFAULT_PLANS;
  } catch {
    return DEFAULT_PLANS;
  }
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEntitlementRow(r: any): EntitlementRecord {
  return { planId: r.plan_id, source: r.source, sourceRef: r.source_ref, startsAt: r.starts_at, expiresAt: r.expires_at, revokedAt: r.revoked_at };
}

/** Access for a user id. Callers must have authorized the lookup (own session, signed API call, or staff). */
export async function loadAccessForUser(userId: string): Promise<AccessSummary> {
  const sql = getSql();
  if (!sql) return FREE_ACCESS;
  const [rows, plans] = await Promise.all([
    sql`select plan_id, source, source_ref, starts_at, expires_at, revoked_at from entitlements where user_id = ${userId}`,
    getPlans(),
  ]);
  return resolveAccess(rows.map(mapEntitlementRow), plans);
}

/** Current visitor's access (free for anonymous visitors). Cached per request. */
export const getCurrentAccess = cache(async (): Promise<{ userId: string | null; access: AccessSummary }> => {
  const u = await getSessionUser();
  if (!u) return { userId: null, access: FREE_ACCESS };
  return { userId: u.id, access: await loadAccessForUser(u.id) };
});
