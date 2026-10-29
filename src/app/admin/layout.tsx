import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV: [string, string, boolean][] = [
  ["/admin", "Overview", false],
  ["/admin/discovery", "Discovery queue", true],
  ["/admin/sources", "Sources", true],
  ["/admin/ingestion", "Ingestion history", true],
  ["/admin/import", "CSV import", true],
  ["/admin/camps", "Camps", true],
  ["/admin/reviews", "Review moderation", false],
  ["/admin/external-reviews", "External reviews", true],
  ["/admin/research", "Research", true],
  ["/admin/plans", "Plans", true],
  ["/admin/entitlements", "Entitlements", true],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireStaff("moderator");
  const nav = NAV.filter(([, , adminOnly]) => !adminOnly || user.role === "admin");
  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto text-sm lg:flex-col">
        {nav.map(([href, label]) => <Link key={href} href={href} className="btn-ghost justify-start whitespace-nowrap px-3 py-1.5">{label}</Link>)}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
