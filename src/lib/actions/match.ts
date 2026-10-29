"use server";
import { redirect } from "next/navigation";
import { hasFeature } from "../billing/entitlements";
import { matchProfileSchema } from "../matching/score";
import { getCurrentAccess } from "../server/access";
import { requireSql } from "../db";

/** Saves the (optional) matching profile for Elite members, then shows results. */
export async function saveMatchProfile(formData: FormData) {
  const { userId, access } = await getCurrentAccess();
  if (!userId || !hasFeature(access, "camp_matching")) redirect("/pricing");
  const parsed = matchProfileSchema.safeParse({
    sport: formData.get("sport"),
    position: formData.get("position") || undefined,
    gradYear: formData.get("gradYear") || undefined,
    homeState: formData.get("homeState") || undefined,
    preferredLevels: formData.getAll("preferredLevels"),
    gpa: formData.get("gpa") || undefined,
    maxTravelMiles: formData.get("maxTravelMiles") || undefined,
    budgetDollars: formData.get("budgetDollars") || undefined,
  });
  if (!parsed.success) redirect("/match?error=1");
  const p = parsed.data;
  // Owner-only write (formerly RLS): the row is keyed by the signed-in user's id.
  const budget = p.budgetDollars != null ? Math.round(p.budgetDollars * 100) : null;
  await requireSql()`
    insert into match_profiles (user_id, sport, position, grad_year, home_state, preferred_levels, gpa, max_travel_miles, budget_cents, updated_at)
    values (${userId}, ${p.sport}, ${p.position ?? null}, ${p.gradYear ?? null}, ${p.homeState ?? null}, ${p.preferredLevels}::text[],
            ${p.gpa ?? null}, ${p.maxTravelMiles ?? null}, ${budget}, now())
    on conflict (user_id) do update set sport = excluded.sport, position = excluded.position, grad_year = excluded.grad_year,
      home_state = excluded.home_state, preferred_levels = excluded.preferred_levels, gpa = excluded.gpa,
      max_travel_miles = excluded.max_travel_miles, budget_cents = excluded.budget_cents, updated_at = now()`;
  redirect("/match");
}
