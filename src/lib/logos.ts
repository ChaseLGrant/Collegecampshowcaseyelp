/**
 * Organizer / school logos for camp cards and camp pages.
 *
 * Resolution order (no database columns involved):
 *   1. Local logo from src/lib/logos.data.json (files in public/logos/), matched on the camp's
 *      institution name first, then its organizer name, using each entry's name + aliases.
 *   2. Automatic fallback for organizers we have not mapped yet (new ingests, parent submissions):
 *      the site icon of the organizer's own domain, derived from the camp's registration URL or
 *      source URL. Generic registration/ticketing hosts (Ryzer, TotalCamps, Eventbrite, Google
 *      Forms, ...) are skipped because their icon would not be the organizer's.
 *   3. A neutral initials badge (e.g. "PG").
 *
 * To add a logo for a new organizer: `node scripts/add-logo.mjs "<Organizer name>" <logo url> [--alias "..."]`
 * (see README "Organizer logos").
 */
import logoData from "./logos.data.json";

export interface LogoEntry {
  name: string;
  logo: string;
  aliases?: string[];
  /** Optional background for white/transparent marks that need a dark tile. */
  bg?: string;
  source?: string;
}

export type CampLogo =
  | { kind: "local"; src: string; bg: string | null; label: string; initials: string }
  | { kind: "favicon"; src: string; domain: string; label: string; initials: string }
  | { kind: "initials"; label: string; initials: string };

export interface LogoSubject {
  name?: string | null;
  institutionName?: string | null;
  organizerName?: string | null;
  registrationUrl?: string | null;
  sourceUrl?: string | null;
}

const ENTRIES = logoData as LogoEntry[];

/** Lowercase, '&' -> 'and', drop punctuation and a leading "the", collapse whitespace. */
export function normalizeOrgName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\s+/g, " ");
}

const INDEX: Map<string, LogoEntry> = (() => {
  const m = new Map<string, LogoEntry>();
  for (const e of ENTRIES) {
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const k = normalizeOrgName(n);
      if (k && !m.has(k)) m.set(k, e);
    }
  }
  return m;
})();

/** Candidate keys for a name: as-is, without "(...)" parts, and each parenthetical on its own. */
function keysFor(name: string): string[] {
  const keys = [name];
  const stripped = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (stripped && stripped !== name) keys.push(stripped);
  for (const m of name.matchAll(/\(([^)]+)\)/g)) keys.push(m[1]);
  // "X / Y" and "X - Y" style names: try each side.
  for (const part of stripped.split(/\s+[/–—-]\s+|\s*\/\s*/)) if (part && part !== stripped) keys.push(part);
  return keys.map(normalizeOrgName).filter(Boolean);
}

export function findLogoEntry(name: string | null | undefined): LogoEntry | null {
  if (!name) return null;
  for (const k of keysFor(name)) {
    const hit = INDEX.get(k);
    if (hit) return hit;
  }
  return null;
}

/** Hosts whose icon belongs to a registration/ticketing/form platform, not the organizer. */
const GENERIC_HOST_SUFFIXES = [
  "ryzer.com", "totalcamps.com", "campsite.bio", "active.com", "activenetwork.com", "eventbrite.com", "eventbrite.co",
  "google.com", "forms.gle", "goo.gl", "googleusercontent.com", "sites.google.com", "jotform.com", "typeform.com",
  "wufoo.com", "formstack.com", "formsite.com", "cognitoforms.com", "surveymonkey.com", "123formbuilder.com", "wix.com", "wixsite.com",
  "squarespace.com", "weebly.com", "godaddysites.com", "wordpress.com", "blogspot.com", "carrd.co", "linktr.ee",
  "bit.ly", "tinyurl.com", "facebook.com", "fb.me", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com",
  "leagueapps.com", "teamsnap.com", "sportsengine.com", "sportngin.com", "exposureevents.com", "gotsport.com",
  "playerspace.com", "abcsignup.com", "regpack.com", "campbrainregistration.com", "campbrain.com", "ultracamp.com",
  "campdoc.com", "campminder.com", "amilia.com", "jumbula.com", "sawyer.com", "bonzidev.com", "secure-sam.com",
  "stackteamapp.com", "tourneymachine.com", "playmetrics.com", "demosphere.com", "demosphere-secure.com",
  "ussportscamps.com", "collegecampsonline.com", "eteamz.com", "maxpreps.com", "hudl.com", "ncsasports.org",
  "fieldlevel.com", "bluefishbaseball.com", "eventconnect.io", "signupgenius.com", "zeffy.com", "givebutter.com",
  "paypal.com", "venmo.com", "square.site", "squareup.com", "stripe.com", "shopify.com", "myshopify.com",
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

export function isGenericHost(host: string): boolean {
  return GENERIC_HOST_SUFFIXES.some((g) => host === g || host.endsWith(`.${g}`));
}

/** The organizer's own domain from the registration URL (preferred) or source URL, or null. */
export function organizerDomain(subject: Pick<LogoSubject, "registrationUrl" | "sourceUrl">): string | null {
  for (const url of [subject.registrationUrl, subject.sourceUrl]) {
    const h = hostOf(url);
    if (h && !isGenericHost(h)) return h;
  }
  return null;
}

export function faviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

const INITIALS_STOP = new Set([
  "of", "the", "and", "at", "for", "a", "an", "in", "x",
  "university", "camps", "camp", "llc", "inc", "athletics", "sports", "events", "academy",
]);

/** "Perfect Game" -> "PG"; "Premier Girls Fastpitch (PGF)" -> "PGF"; "UCLA" -> "UCLA". Max 3 chars (4 for acronyms). */
export function orgInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const paren = name.match(/\(([A-Z0-9]{2,4})\)/);
  if (paren) return paren[1];
  const base = name.replace(/\([^)]*\)/g, " ").trim();
  if (/^[A-Z0-9]{2,4}$/.test(base)) return base;
  const words = base.split(/[\s/–—-]+/).filter(Boolean);
  const sig = words.filter((w) => !INITIALS_STOP.has(w.toLowerCase()));
  const use = sig.length ? sig : words;
  const letters = use.map((w) => (/^[A-Z0-9]{2,4}$/.test(w) ? w : w.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase())).join("");
  return letters.slice(0, 3) || "?";
}

/** The name shown next to the logo (same precedence as the card subtitle). */
export function logoLabel(subject: LogoSubject): string {
  return subject.institutionName ?? subject.organizerName ?? subject.name ?? "Camp";
}

export function resolveCampLogo(subject: LogoSubject): CampLogo {
  const label = logoLabel(subject);
  const initials = orgInitials(label);
  const byInstitution = findLogoEntry(subject.institutionName);
  if (byInstitution) return { kind: "local", src: byInstitution.logo, bg: byInstitution.bg ?? null, label, initials };
  const byOrganizer = findLogoEntry(subject.organizerName);
  if (byOrganizer) {
    return { kind: "local", src: byOrganizer.logo, bg: byOrganizer.bg ?? null, label: subject.organizerName ?? label, initials };
  }
  const domain = organizerDomain(subject);
  if (domain) return { kind: "favicon", src: faviconUrl(domain), domain, label, initials };
  return { kind: "initials", label, initials };
}
