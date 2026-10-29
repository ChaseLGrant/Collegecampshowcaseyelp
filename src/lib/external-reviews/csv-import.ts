import { parseCsv } from "../ingestion/csv";
import { cleanText, parseDate } from "../ingestion/normalize";
import { safeHttpUrl } from "../security/urls";
import type { ExternalProvenance } from "../types";

export const EXTERNAL_REVIEW_CSV_COLUMNS = [
  "platform_name", "source_url", "referenced_name", "sport", "review_date", "rating", "rating_scale",
  "excerpt", "reviewer_display", "attribution", "provenance_type", "city", "state", "organizer",
] as const;

const PROVENANCE: ExternalProvenance[] = ["licensed_dataset", "authorized_api", "public_page", "organizer_testimonial", "editorial"];

export interface ParsedExternalRow {
  platformName: string;
  sourceUrl: string;
  referencedName: string;
  sport: string | null;
  reviewDate: string | null;
  rating: number | null;
  ratingScale: number | null;
  excerpt: string | null;
  reviewerDisplay: string | null;
  attribution: string;
  provenanceType: ExternalProvenance;
  city: string | null;
  state: string | null;
  organizer: string | null;
}

export function parseExternalReviewCsv(text: string): { rows: ParsedExternalRow[]; errors: string[] } {
  const { headers, rows } = parseCsv(text);
  const errors: string[] = [];
  for (const req of ["platform_name", "source_url", "referenced_name", "attribution"]) {
    if (!headers.includes(req)) errors.push(`Missing required column "${req}"`);
  }
  if (errors.length) return { rows: [], errors };
  const out: ParsedExternalRow[] = [];
  rows.slice(0, 5000).forEach((r, i) => {
    const url = safeHttpUrl(r.source_url);
    if (!url) { errors.push(`Row ${i + 2}: invalid source_url`); return; }
    if (!r.referenced_name || !r.platform_name || !r.attribution) { errors.push(`Row ${i + 2}: missing required value`); return; }
    const rating = r.rating ? Number(r.rating) : null;
    const scale = r.rating_scale ? Number(r.rating_scale) : rating != null ? 5 : null;
    if (rating != null && (!Number.isFinite(rating) || rating < 0 || (scale != null && rating > scale))) {
      errors.push(`Row ${i + 2}: invalid rating`); return;
    }
    out.push({
      platformName: cleanText(r.platform_name, 80)!,
      sourceUrl: url,
      referencedName: cleanText(r.referenced_name, 200)!,
      sport: r.sport?.toLowerCase() || null,
      reviewDate: parseDate(r.review_date),
      rating,
      ratingScale: scale,
      excerpt: cleanText(r.excerpt, 600),
      reviewerDisplay: cleanText(r.reviewer_display, 80),
      attribution: cleanText(r.attribution, 200)!,
      provenanceType: PROVENANCE.includes(r.provenance_type as ExternalProvenance) ? (r.provenance_type as ExternalProvenance) : "licensed_dataset",
      city: cleanText(r.city, 80),
      state: r.state?.toUpperCase().slice(0, 2) || null,
      organizer: cleanText(r.organizer, 160),
    });
  });
  return { rows: out, errors };
}
