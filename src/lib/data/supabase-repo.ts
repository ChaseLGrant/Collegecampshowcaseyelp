import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "../search";
import type { CampRepository } from "./repository";
import { mapDetailRow, mapDirectoryRow, mapExternalPublicRow, mapResearchRow, mapReviewRow } from "./mappers";

const DIRECTORY_COLUMNS =
  "id,slug,name,sport,sport_detail,event_type,city,state,venue,start_date,end_date,price_cents,price_notes," +
  "registration_url,description,eligibility,positions,status,verification_status,last_verified_at,source_url," +
  "institution_name,institution_slug,association,division,classification_verified,organizer_name," +
  "review_count,avg_overall,avg_value,avg_instruction,avg_exposure,avg_organization,verified_review_count";

/** Escapes characters that have meaning in PostgREST filter strings. */
function safeLike(v: string) {
  return v.replace(/[%_,()\\*]/g, " ").trim();
}

export function makeSupabaseRepository(db: SupabaseClient): CampRepository {
  return {
    mode: "live",

    async searchCamps(f) {
      let q = db.from("camp_directory").select(DIRECTORY_COLUMNS, { count: "exact" })
        .in("status", ["published", "cancelled"]);
      if (f.sport) q = q.eq("sport", f.sport);
      if (f.state) q = q.eq("state", f.state);
      if (f.college) q = q.ilike("institution_name", `%${safeLike(f.college)}%`);
      if (f.association) q = q.eq("association", f.association).eq("classification_verified", true);
      if (f.division) q = q.eq("division", f.division).eq("classification_verified", true);
      if (f.eventType) q = q.eq("event_type", f.eventType);
      if (f.minPrice != null) q = q.gte("price_cents", Math.round(f.minPrice * 100));
      if (f.maxPrice != null) q = q.lte("price_cents", Math.round(f.maxPrice * 100));
      if (!f.includePast) q = q.or(`start_date.is.null,end_date.gte.${todayISO()},start_date.gte.${todayISO()}`);
      if (f.from) q = q.gte("start_date", f.from);
      if (f.to) q = q.lte("start_date", f.to);
      if (f.minRating != null) q = q.gte("avg_overall", f.minRating).gt("review_count", 0);
      if (f.minReviews != null) q = q.gte("review_count", f.minReviews);
      if (f.q) q = q.textSearch("search", f.q, { type: "websearch", config: "english" });

      switch (f.sort) {
        case "price_low": q = q.order("price_cents", { ascending: true, nullsFirst: false }); break;
        case "price_high": q = q.order("price_cents", { ascending: false, nullsFirst: false }); break;
        // Same Bayesian score as src/lib/ratings.ts — unreviewed camps sort last, few-review camps can't dominate.
        case "rating": q = q.order("ranking_score", { ascending: false }); break;
        case "reviews": q = q.order("review_count", { ascending: false }); break;
        default: break;
      }
      q = q.order("start_date", { ascending: true, nullsFirst: false });
      const from = (f.page - 1) * f.pageSize;
      const { data, count, error } = await q.range(from, from + f.pageSize - 1);
      if (error) throw new Error(`Search failed: ${error.message}`);
      return { items: (data ?? []).map(mapDirectoryRow), total: count ?? 0 };
    },

    async getCampBySlug(slug) {
      const { data, error } = await db.from("camp_directory").select(DIRECTORY_COLUMNS).eq("slug", slug).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const id = (data as unknown as { id: string }).id;
      const [colleges, coaches] = await Promise.all([
        db.from("camp_participating_colleges").select("verified,source_url,institutions(name)").eq("camp_id", id),
        db.from("camp_coaches").select("coach_name,title,verified,source_url").eq("camp_id", id),
      ]);
      return mapDetailRow(data, colleges.data ?? [], coaches.data ?? []);
    },

    async getCampsBySlugs(slugs) {
      if (!slugs.length) return [];
      const { data } = await db.from("camp_directory").select(DIRECTORY_COLUMNS).in("slug", slugs.slice(0, 100));
      const base = (data ?? []) as unknown as { id: string; slug: string }[];
      const ids = base.map((r) => r.id);
      const [colleges, coaches] = ids.length
        ? await Promise.all([
            db.from("camp_participating_colleges").select("camp_id,verified,source_url,institutions(name)").in("camp_id", ids),
            db.from("camp_coaches").select("camp_id,coach_name,title,verified,source_url").in("camp_id", ids),
          ])
        : [{ data: [] }, { data: [] }];
      const rows = base.map((r) =>
        mapDetailRow(r, (colleges.data ?? []).filter((c: { camp_id: string }) => c.camp_id === r.id), (coaches.data ?? []).filter((c: { camp_id: string }) => c.camp_id === r.id)),
      );
      return slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is (typeof rows)[number] => !!r);
    },

    async listReviews(campId) {
      const { data } = await db.from("reviews")
        .select("id,camp_id,attendee_role,attended_year,rating_value,rating_instruction,rating_exposure,rating_organization,rating_overall,title,body,would_recommend,verification,created_at")
        .eq("camp_id", campId).eq("status", "published").order("created_at", { ascending: false }).limit(100);
      return (data ?? []).map(mapReviewRow);
    },

    async listExternalReviews(campId) {
      const { data } = await db.from("external_reviews_public").select("*").eq("camp_id", campId)
        .order("review_date", { ascending: false, nullsFirst: false }).limit(50);
      return (data ?? []).map(mapExternalPublicRow);
    },

    async getResearchSummary(campId) {
      // RLS decides which access tiers the caller may read.
      const { data } = await db.from("research_summaries").select("*").eq("camp_id", campId)
        .eq("status", "approved").order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return data ? mapResearchRow(data) : null;
    },

    async getFilterOptions(sport) {
      let q = db.from("camp_directory").select("state,institution_name,institution_slug").eq("status", "published").limit(5000);
      if (sport) q = q.eq("sport", sport);
      const { data } = await q;
      const counts = new Map<string, number>();
      const colleges = new Map<string, string>();
      (data ?? []).forEach((r: { state: string | null; institution_name: string | null; institution_slug: string | null }) => {
        if (r.state) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
        if (r.institution_slug && r.institution_name) colleges.set(r.institution_slug, r.institution_name);
      });
      return {
        states: [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
        colleges: [...colleges].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },

    async countBySport() {
      const { data } = await db.from("camps").select("sport").eq("status", "published").limit(20000);
      const out: Record<string, number> = {};
      (data ?? []).forEach((r: { sport: string }) => (out[r.sport] = (out[r.sport] ?? 0) + 1));
      return out;
    },

    async listPublishedSlugs(limit) {
      const { data } = await db.from("camps").select("slug,updated_at").eq("status", "published")
        .order("updated_at", { ascending: false }).limit(limit);
      return (data ?? []).map((r: { slug: string; updated_at: string }) => ({ slug: r.slug, updatedAt: r.updated_at }));
    },
  };
}
