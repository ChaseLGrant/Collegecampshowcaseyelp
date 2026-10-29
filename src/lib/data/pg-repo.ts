import "server-only";
import type { Sql } from "../db";
import { todayISO } from "../search";
import type { CampRepository } from "./repository";
import { mapDetailRow, mapDirectoryRow, mapExternalPublicRow, mapResearchRow, mapReviewRow } from "./mappers";

const DIRECTORY_COLUMNS = [
  "id", "slug", "name", "sport", "sport_detail", "event_type", "city", "state", "venue", "start_date", "end_date", "price_cents", "price_notes",
  "registration_url", "description", "eligibility", "positions", "status", "verification_status", "last_verified_at", "source_url",
  "institution_name", "institution_slug", "association", "division", "classification_verified", "organizer_name",
  "review_count", "avg_overall", "avg_value", "avg_instruction", "avg_exposure", "avg_organization", "verified_review_count",
];

const TIERS_VISIBLE: Record<"free" | "insider" | "elite", string[]> = {
  free: ["free"],
  insider: ["free", "insider"],
  elite: ["free", "insider", "elite"],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function collegesAndCoaches(sql: Sql, ids: string[]) {
  if (!ids.length) return { colleges: [] as any[], coaches: [] as any[] };
  const [colleges, coaches] = await Promise.all([
    sql`select cpc.camp_id, cpc.verified, cpc.source_url, json_build_object('name', i.name) as institutions
        from camp_participating_colleges cpc join institutions i on i.id = cpc.institution_id where cpc.camp_id = any(${ids}::uuid[])`,
    sql`select camp_id, coach_name, title, verified, source_url from camp_coaches where camp_id = any(${ids}::uuid[])`,
  ]);
  return { colleges: [...colleges], coaches: [...coaches] };
}

/** Postgres-backed public repository. Public pages only ever see published/cancelled camps and published reviews. */
export function makePgRepository(sql: Sql): CampRepository {
  const cols = sql(DIRECTORY_COLUMNS);
  return {
    mode: "live",

    async searchCamps(f) {
      const today = todayISO();
      const conds = [sql`status in ('published', 'cancelled')`];
      if (f.sport) conds.push(sql`sport = ${f.sport}`);
      if (f.state) conds.push(sql`state = ${f.state}`);
      if (f.college) conds.push(sql`institution_name ilike ${"%" + f.college.replace(/[%_\\]/g, " ").trim() + "%"}`);
      if (f.association) conds.push(sql`association = ${f.association} and classification_verified`);
      if (f.division) conds.push(sql`division = ${f.division} and classification_verified`);
      if (f.eventType) conds.push(sql`event_type = ${f.eventType}`);
      if (f.minPrice != null) conds.push(sql`price_cents >= ${Math.round(f.minPrice * 100)}`);
      if (f.maxPrice != null) conds.push(sql`price_cents <= ${Math.round(f.maxPrice * 100)}`);
      if (!f.includePast) conds.push(sql`(start_date is null or end_date >= ${today}::date or start_date >= ${today}::date)`);
      if (f.from) conds.push(sql`start_date >= ${f.from}::date`);
      if (f.to) conds.push(sql`start_date <= ${f.to}::date`);
      if (f.minRating != null) conds.push(sql`avg_overall >= ${f.minRating} and review_count > 0`);
      if (f.minReviews != null) conds.push(sql`review_count >= ${f.minReviews}`);
      if (f.q) conds.push(sql`search @@ websearch_to_tsquery('english', ${f.q})`);
      const where = conds.reduce((a, c) => sql`${a} and ${c}`);

      // Same Bayesian score as src/lib/ratings.ts — unreviewed camps sort last, few-review camps can't dominate.
      const primary =
        f.sort === "price_low" ? sql`price_cents asc nulls last,` :
        f.sort === "price_high" ? sql`price_cents desc nulls last,` :
        f.sort === "rating" ? sql`ranking_score desc,` :
        f.sort === "reviews" ? sql`review_count desc,` : sql``;
      const offset = (f.page - 1) * f.pageSize;
      const [rows, [{ total }]] = await Promise.all([
        sql`select ${cols} from camp_directory where ${where} order by ${primary} start_date asc nulls last, id limit ${f.pageSize} offset ${offset}`,
        sql<{ total: number }[]>`select count(*)::int as total from camp_directory where ${where}`,
      ]);
      return { items: rows.map(mapDirectoryRow), total };
    },

    async getCampBySlug(slug) {
      const [row] = await sql`select ${cols} from camp_directory where slug = ${slug} and status in ('published', 'cancelled')`;
      if (!row) return null;
      const { colleges, coaches } = await collegesAndCoaches(sql, [row.id]);
      return mapDetailRow(row, colleges, coaches);
    },

    async getCampsBySlugs(slugs) {
      if (!slugs.length) return [];
      const base = await sql`select ${cols} from camp_directory where slug = any(${slugs.slice(0, 100)}::text[]) and status in ('published', 'cancelled')`;
      const { colleges, coaches } = await collegesAndCoaches(sql, base.map((r) => r.id));
      const rows = base.map((r) => mapDetailRow(r, colleges.filter((c) => c.camp_id === r.id), coaches.filter((c) => c.camp_id === r.id)));
      return slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is (typeof rows)[number] => !!r);
    },

    async listReviews(campId) {
      const rows = await sql`
        select id, camp_id, attendee_role, attended_year, rating_value, rating_instruction, rating_exposure, rating_organization,
               rating_overall, title, body, would_recommend, verification, created_at
        from reviews where camp_id = ${campId} and status = 'published' order by created_at desc limit 100`;
      return rows.map(mapReviewRow);
    },

    async listExternalReviews(campId) {
      const rows = await sql`select * from external_reviews_public where camp_id = ${campId} order by review_date desc nulls last limit 50`;
      return rows.map(mapExternalPublicRow);
    },

    async getResearchSummary(campId, tier) {
      // Tier gating (formerly RLS): only approved summaries at or below the caller's tier.
      const [row] = await sql`
        select * from research_summaries
        where camp_id = ${campId} and status = 'approved' and access_tier = any(${TIERS_VISIBLE[tier] ?? ["free"]}::text[])
        order by generated_at desc limit 1`;
      return row ? mapResearchRow(row) : null;
    },

    async getFilterOptions(sport) {
      const rows = await sql<{ state: string | null; institution_name: string | null; institution_slug: string | null }[]>`
        select state, institution_name, institution_slug from camp_directory
        where status = 'published' ${sport ? sql`and sport = ${sport}` : sql``} limit 5000`;
      const counts = new Map<string, number>();
      const colleges = new Map<string, string>();
      rows.forEach((r) => {
        if (r.state) counts.set(r.state.trim(), (counts.get(r.state.trim()) ?? 0) + 1);
        if (r.institution_slug && r.institution_name) colleges.set(r.institution_slug, r.institution_name);
      });
      return {
        states: [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
        colleges: [...colleges].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
      };
    },

    async countBySport() {
      const rows = await sql<{ sport: string; n: number }[]>`select sport, count(*)::int as n from camps where status = 'published' group by sport`;
      const out: Record<string, number> = {};
      rows.forEach((r) => (out[r.sport] = r.n));
      return out;
    },

    async listPublishedSlugs(limit) {
      const rows = await sql<{ slug: string; updated_at: string }[]>`
        select slug, updated_at from camps where status = 'published' order by updated_at desc limit ${limit}`;
      return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
    },
  };
}
