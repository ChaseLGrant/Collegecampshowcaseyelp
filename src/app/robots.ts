import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/login", "/auth/", "/search", "/compare", "/match"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
