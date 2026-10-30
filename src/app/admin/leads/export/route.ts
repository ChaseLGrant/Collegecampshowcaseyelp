import { NextResponse } from "next/server";
import { leadsToCsv } from "@/lib/leads";
import { audit, getSessionUser, isStaff } from "@/lib/server/auth";
import { requireSql } from "@/lib/db";
import { parseLeadFilters, queryLeads } from "../query";

export const dynamic = "force-dynamic";

/** Admin-only CSV export of leads (respects the page's filters). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/admin/leads", req.url), 303);
  if (!isStaff(user, "admin")) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const f = parseLeadFilters(Object.fromEntries(url.searchParams));
  const rows = await queryLeads(requireSql(), f, 50000);
  await audit(user.id, "leads.export", "leads", null, { count: rows.length, ...f });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(leadsToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="camp-check-leads-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
