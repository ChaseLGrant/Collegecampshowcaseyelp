import { getSessionUser } from "@/lib/server/auth";
import { hasFeature } from "@/lib/billing/entitlements";
import { getCurrentAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

/**
 * The signed-in visitor, for the client-side parts of otherwise cached (ISR) pages:
 * header account links, the camp page save button and premium research.
 * Anonymous visitors get { signedIn: false } with no database work beyond the cookie check.
 */
export async function GET() {
  const user = await getSessionUser().catch(() => null);
  if (!user) return Response.json({ signedIn: false }, { headers: { "cache-control": "private, no-store" } });
  const { access } = await getCurrentAccess();
  return Response.json(
    {
      signedIn: true,
      staff: user.role === "admin" || user.role === "moderator",
      features: {
        saved_lists: hasFeature(access, "saved_lists"),
        premium_research: hasFeature(access, "premium_research"),
      },
      tier: access.tier,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
