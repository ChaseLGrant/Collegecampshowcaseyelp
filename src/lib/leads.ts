import { z } from "zod";
import { SPORT_IDS } from "./sports";

export const LEAD_ROLES = ["parent", "athlete", "coach"] as const;
export const LEAD_INTERESTS = ["camp_alerts", "coach_call"] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));

export const leadInputSchema = z.object({
  name: optionalText(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: optionalText(30).refine((v) => v == null || /^[0-9+().\-\s]{7,30}$/.test(v), "Enter a valid phone number."),
  role: z.enum(LEAD_ROLES, { errorMap: () => ({ message: "Choose parent, athlete or coach." }) }),
  gradYear: z.union([z.coerce.number().int().min(2020).max(2045), z.literal(""), z.null()]).optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  sport: z.enum(SPORT_IDS as [string, ...string[]], { errorMap: () => ({ message: "Choose a sport." }) }),
  interest: z.enum(LEAD_INTERESTS).default("camp_alerts"),
  sourcePage: optionalText(300),
  campSlug: optionalText(200).refine((v) => v == null || /^[a-z0-9-]+$/.test(v), "Invalid camp."),
  consent: z.literal(true, { errorMap: () => ({ message: "Please check the box so we can contact you." }) }),
  website: z.string().max(0).optional().or(z.literal("")), // honeypot
  elapsedMs: z.number().optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export interface LeadRow {
  id: string; name: string | null; email: string; phone: string | null; role: string; grad_year: number | null;
  sport: string; interest: string; source_page: string | null; camp_slug: string | null; consent: boolean;
  consent_at: string | null; submission_count: number; created_at: string; updated_at: string;
}

export const LEAD_CSV_COLUMNS: (keyof LeadRow)[] = [
  "created_at", "updated_at", "name", "email", "phone", "role", "grad_year", "sport", "interest", "source_page", "camp_slug", "consent", "consent_at", "submission_count",
];

/** RFC 4180 CSV cell, with spreadsheet formula injection neutralized. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(rows: LeadRow[]): string {
  const lines = [LEAD_CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(LEAD_CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
