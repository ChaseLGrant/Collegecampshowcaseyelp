import { getVisitorRepository } from "@/lib/data";
import { hasFeature } from "@/lib/billing/entitlements";
import { getCurrentAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

/** Premium research summary for the signed-in visitor's tier (camp pages are cached, so this is fetched client-side). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  const { access } = await getCurrentAccess();
  if (!hasFeature(access, "premium_research")) return Response.json({ research: null }, { status: 403, headers });
  const repo = await getVisitorRepository();
  const camp = await repo.getCampBySlug((await params).slug);
  if (!camp) return Response.json({ research: null }, { status: 404, headers });
  return Response.json({ research: await repo.getResearchSummary(camp.id, access.tier) }, { headers });
}
