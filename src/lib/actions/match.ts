"use server";
import { redirect } from "next/navigation";
import { hasFeature } from "../billing/entitlements";
import { matchProfileSchema } from "../matching/score";
import { getCurrentAccess } from "../server/access";
import { getServerSupabase } from "../supabase/server";

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
  const db = (await getServerSupabase())!;
  await db.from("match_profiles").upsert({
    user_id: userId, sport: p.sport, position: p.position ?? null, grad_year: p.gradYear ?? null,
    home_state: p.homeState ?? null, preferred_levels: p.preferredLevels, gpa: p.gpa ?? null,
    max_travel_miles: p.maxTravelMiles ?? null, budget_cents: p.budgetDollars != null ? Math.round(p.budgetDollars * 100) : null,
    updated_at: new Date().toISOString(),
  });
  redirect("/match");
}
