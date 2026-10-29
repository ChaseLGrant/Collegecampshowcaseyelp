import "server-only";
import type { Sql } from "@/lib/db";
import type { LeadRow } from "@/lib/leads";
import { isSportId } from "@/lib/sports";

export interface LeadFilters { sport: string | null; interest: string | null; q: string | null }

export function parseLeadFilters(sp: Record<string, string | undefined>): LeadFilters {
  return {
    sport: isSportId(sp.sport) ? sp.sport : null,
    interest: sp.interest === "camp_alerts" || sp.interest === "coach_call" ? sp.interest : null,
    q: sp.q?.trim().slice(0, 100) || null,
  };
}

export async function queryLeads(sql: Sql, f: LeadFilters, limit: number): Promise<LeadRow[]> {
  const conds = [sql`true`];
  if (f.sport) conds.push(sql`sport = ${f.sport}`);
  if (f.interest) conds.push(sql`interest = ${f.interest}`);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, " ")}%`;
    conds.push(sql`(email ilike ${like} or name ilike ${like} or camp_slug ilike ${like})`);
  }
  const where = conds.reduce((a, b) => sql`${a} and ${b}`);
  return sql<LeadRow[]>`
    select id, name, email, phone, role, grad_year, sport, interest, source_page, camp_slug, consent, consent_at,
           submission_count, created_at, updated_at
    from leads where ${where} order by updated_at desc limit ${limit}`;
}
