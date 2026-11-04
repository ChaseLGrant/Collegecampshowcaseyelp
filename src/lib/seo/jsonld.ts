import { env } from "../env";
import { formatDateRange, formatPrice, locationLabel } from "../format";
import { resolveCampLogo } from "../logos";
import { safeHttpUrl } from "../security/urls";
import { eventTypeLabel, sportLabel } from "../sports";
import { MIN_LISTINGS_FOR_INDEXED_HUB, truncate } from "./hubs";
import { stateName } from "../states";
import type { CampDetail } from "../types";

/**
 * schema.org SportsEvent for a camp page, built only from fields on the listing.
 * No aggregateRating: Camp Check never marks up ratings on event pages (and never from external sources).
 * Offers only when a real price is listed; dates only when announced.
 */
export function campJsonLd(camp: CampDetail): Record<string, unknown> | null {
  if (camp.isSample || !camp.startDate) return null;
  const url = `${env.siteUrl}/camps/${camp.slug}`;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: camp.name,
    url,
    sport: sportLabel(camp.sport),
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
      address: {
        "@type": "PostalAddress",
        ...(camp.city ? { addressLocality: camp.city } : {}),
        ...(camp.state ? { addressRegion: camp.state } : {}),
        addressCountry: "US",
      },
    };
  }
  const organizer = camp.organizerName ?? camp.institutionName;
  if (organizer) ld.organizer = { "@type": camp.institutionName && !camp.organizerName ? "CollegeOrUniversity" : "Organization", name: organizer };
  if (camp.institutionName && camp.organizerName && camp.organizerName !== camp.institutionName) {
    ld.sponsor = { "@type": "CollegeOrUniversity", name: camp.institutionName };
  }
  const logo = resolveCampLogo(camp);
  if (logo.kind === "local" && logo.src.startsWith("/")) ld.image = [`${env.siteUrl}${logo.src}`];
  if (camp.priceCents != null) {
    const reg = safeHttpUrl(camp.registrationUrl);
    ld.offers = {
      "@type": "Offer",
      price: (camp.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      ...(reg ? { url: reg } : {}),
    };
  }
  if (camp.eligibility) ld.audience = { "@type": "Audience", audienceType: camp.eligibility };
  return ld;
}

/** Site-wide Organization + WebSite (with sitelinks SearchAction). */
export function siteJsonLd() {
  const base = env.siteUrl;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "Camp Check",
        url: `${base}/`,
        logo: `${base}/brand/icon-512.png`,
        description: "An independent directory of college recruiting camps and showcases from The Athlete Market.",
        parentOrganization: { "@type": "Organization", name: "The Athlete Market", url: "https://theathletemarket.com" },
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: "Camp Check",
        url: `${base}/`,
        publisher: { "@id": `${base}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${env.siteUrl}${it.path}` })),
  };
}

/** Thin-content guard: state directory pages are indexable only with enough listings. */
export const MIN_LISTINGS_FOR_INDEXED_STATE_PAGE = MIN_LISTINGS_FOR_INDEXED_HUB;

/**
 * Camp page title aimed at how families search: "[Camp name] [year] | Dates, Cost & Ages".
 * The year comes from the listed start date; "Ages" only when the listing has eligibility info.
 */
export function campPageTitle(camp: Pick<CampDetail, "name" | "startDate" | "eligibility" | "priceCents">): string {
  const year = camp.startDate?.slice(0, 4);
  const name = year && !camp.name.includes(year) ? `${camp.name} ${year}` : camp.name;
  const facets = ["Dates", ...(camp.priceCents != null ? ["Cost"] : []), ...(camp.eligibility ? ["Ages"] : [])];
  const suffix = facets.length === 1 ? "Dates & Details" : `${facets.slice(0, -1).join(", ")} & ${facets[facets.length - 1]}`;
  return `${name} | ${suffix}`;
}

/** Factual meta description for a camp page, from listed fields only. */
export function campMetaDescription(camp: CampDetail): string {
  const host = camp.institutionName ?? camp.organizerName;
  const when = camp.startDate ? formatDateRange(camp.startDate, camp.endDate) : "Dates not yet announced";
  const where = camp.city || camp.state ? ` in ${locationLabel(camp.city, camp.state)}` : "";
  const parts = [
    `${eventTypeLabel(camp.eventType)}${host && !camp.name.includes(host) ? ` hosted by ${host}` : ""}: ${when}${where}.`,
    camp.priceCents != null ? `Cost: ${formatPrice(camp.priceCents)}.` : "",
    camp.eligibility ? `Eligibility: ${camp.eligibility}.` : "",
    "Registration link, details and parent reviews on Camp Check.",
  ].filter(Boolean);
  return truncate(`${camp.name} — ${parts.join(" ")}`, 160);
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
