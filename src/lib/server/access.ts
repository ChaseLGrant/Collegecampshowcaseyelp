import "server-only";
import { cache } from "react";
import { FREE_ACCESS, resolveAccess, type AccessSummary, type EntitlementRecord } from "../billing/entitlements";
import { DEFAULT_PLANS, mapPlanRow, type Plan } from "../billing/plans";
import { getPublicSupabase, getServerSupabase, getServiceSupabase } from "../supabase/server";
import { getSessionUser } from "./auth";

export const getPlans = cache(async (): Promise<Plan[]> => {
  const db = getPublicSupabase();
  if (!db) return DEFAULT_PLANS;
  const { data, error } = await db.from("plans").select("*").eq("active", true).order("sort_order");
  if (error || !data?.length) return DEFAULT_PLANS;
  return data.map(mapPlanRow);
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEntitlementRow(r: any): EntitlementRecord {
  return { planId: r.plan_id, source: r.source, sourceRef: r.source_ref, startsAt: r.starts_at, expiresAt: r.expires_at, revokedAt: r.revoked_at };
}

export async function loadAccessForUser(userId: string, useService = false): Promise<AccessSummary> {
  const db = useService ? getServiceSupabase() : await getServerSupabase();
  if (!db) return FREE_ACCESS;
  const [{ data }, plans] = await Promise.all([
    db.from("entitlements").select("plan_id,source,source_ref,starts_at,expires_at,revoked_at").eq("user_id", userId),
    getPlans(),
  ]);
  return resolveAccess((data ?? []).map(mapEntitlementRow), plans);
}

/** Current visitor's access (free for anonymous visitors). Cached per request. */
export const getCurrentAccess = cache(async (): Promise<{ userId: string | null; access: AccessSummary }> => {
  const u = await getSessionUser();
  if (!u) return { userId: null, access: FREE_ACCESS };
  return { userId: u.id, access: await loadAccessForUser(u.id) };
});
