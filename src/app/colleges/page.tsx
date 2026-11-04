import type { Metadata } from "next";
import Link from "next/link";
import { getHubIndex } from "@/lib/seo/hub-data";
import { collegeHubs } from "@/lib/seo/hubs";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/meta";

export const metadata: Metadata = pageMetadata({
  title: "College Camps by School | Prospect Camps & ID Camps | Camp Check",
  description: "Browse upcoming college prospect camps, ID camps and clinics by host school, with dates, costs and registration links.",
  path: "/colleges",
});

export default async function CollegesPage() {
  const colleges = collegeHubs(await getHubIndex()).sort((a, b) => a.name.localeCompare(b.name));
  const crumbs = [{ name: "Camp Check", path: "/" }, { name: "Colleges", path: "/colleges" }];
  const total = colleges.reduce((n, c) => n + c.count, 0);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(crumbs)) }} />
      <div className="container-page py-6">
        <nav aria-label="Breadcrumb" className="text-sm muted">
          <Link href="/" className="hover:text-brand">Home</Link> / Colleges
        </nav>
        <h1 className="mt-2 h1">College camps by school</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-navy-700">
          {colleges.length
            ? `Camp Check lists ${total} upcoming camps and prospect events hosted by ${colleges.length} college programs. Pick a school to see its dates, costs and registration links.`
            : "No college-hosted events are listed right now."}
        </p>
        <ul className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {colleges.map((c) => (
            <li key={c.slug}><Link className="hover:text-brand" href={c.path}>{c.name}</Link> <span className="muted">({c.count})</span></li>
          ))}
        </ul>
      </div>
    </>
  );
}
