import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Private/API paths and the endless internal-search, compare and match URL spaces are blocked
 * from crawling (they also carry noindex). Login and the review form stay crawlable so Google
 * can see their noindex; a disallowed URL can still be indexed from links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/auth/", "/search", "/compare", "/match"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
