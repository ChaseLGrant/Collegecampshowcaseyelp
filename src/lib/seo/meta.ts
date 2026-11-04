import type { Metadata } from "next";

export const SITE_NAME = "Camp Check";
export const DEFAULT_OG_IMAGE = { url: "/brand/icon-512.png", width: 512, height: 512, alt: "Camp Check by The Athlete Market" };

/**
 * Per-page metadata with canonical, Open Graph and Twitter tags.
 * Next.js replaces (not merges) openGraph/twitter objects per page, so every page sets them in full.
 */
export function pageMetadata(o: { title: string; description: string; path: string; noindex?: boolean; ogType?: "website" | "article" }): Metadata {
  return {
    title: { absolute: o.title },
    description: o.description,
    alternates: { canonical: o.path },
    robots: o.noindex ? { index: false, follow: true } : undefined,
    openGraph: { type: o.ogType ?? "website", siteName: SITE_NAME, title: o.title, description: o.description, url: o.path, images: [DEFAULT_OG_IMAGE] },
    twitter: { card: "summary", title: o.title, description: o.description, images: [DEFAULT_OG_IMAGE.url] },
  };
}

/** True when a directory URL carries filters, sorting or pagination (kept out of the index; canonical points at the clean hub). */
export function hasQueryParams(sp: Record<string, string | string[] | undefined>): boolean {
  return Object.values(sp).some((v) => v !== undefined && v !== "");
}
