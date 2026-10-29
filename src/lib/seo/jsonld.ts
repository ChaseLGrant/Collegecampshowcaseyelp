import { env } from "../env";
import { MIN_REVIEWS_FOR_ESTABLISHED } from "../ratings";
import { stateName } from "../states";
import type { CampDetail } from "../types";

/**
 * schema.org SportsEvent for a camp page. Only verified/listed facts are included.
 * aggregateRating is added ONLY from native community reviews shown on the page,
 * and only once a camp has enough reviews — never from external ratings.
 */
export function campJsonLd(camp: CampDetail): Record<string, unknown> | null {
  if (camp.isSample || !camp.startDate) return null;
  const url = `${env.siteUrl}/camps/${camp.slug}`;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: camp.name,
    url,
    sport: camp.sport,
    startDate: camp.startDate,
    ...(camp.endDate ? { endDate: camp.endDate } : {}),
    eventStatus: camp.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  };
  if (camp.description) ld.description = camp.description;
  if (camp.city || camp.state) {
    ld.location = {
      "@type": "Place",
      name: camp.venue ?? camp.institutionName ?? [camp.city, camp.state].filter(Boolean).join(", "),
      address: { "@type": "PostalAddress", addressLocality: camp.city ?? undefined, addressRegion: camp.state ?? undefined, addressCountry: "US" },
    };
  }
  if (camp.organizerName || camp.institutionName) {
    ld.organizer = { "@type": "Organization", name: camp.organizerName ?? camp.institutionName };
  }
  if (camp.priceCents != null && camp.registrationUrl) {
    ld.offers = { "@type": "Offer", price: (camp.priceCents / 100).toFixed(2), priceCurrency: "USD", url: camp.registrationUrl };
  }
  if (camp.stats.reviewCount >= MIN_REVIEWS_FOR_ESTABLISHED && camp.stats.avgOverall != null) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: camp.stats.avgOverall.toFixed(1),
      reviewCount: camp.stats.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return ld;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${env.siteUrl}${it.path}` })),
  };
}

/** Thin-content guard: state directory pages are indexable only with enough listings. */
export const MIN_LISTINGS_FOR_INDEXED_STATE_PAGE = 3;

export function campPageTitle(camp: CampDetail): string {
  return camp.stats.reviewCount > 0
    ? `${camp.name} Reviews — Is It Worth It?`
    : `${camp.name} — Dates, Cost & Details`;
}

export function directoryTitle(sportLabel: string, stateCode?: string | null): string {
  return stateCode
    ? `${sportLabel} Camps & Showcases in ${stateName(stateCode)} — Reviews & Costs`
    : `College ${sportLabel} Camps & Showcases — Reviews, Costs & Dates`;
}

/** Serializes JSON-LD safely for a <script> tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
