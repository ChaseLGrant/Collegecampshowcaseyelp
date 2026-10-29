import { z } from "zod";

const rating = z.coerce.number().int().min(1, "Choose 1–5 stars").max(5);
const currentYear = new Date().getUTCFullYear();

export const reviewInputSchema = z.object({
  campId: z.string().uuid(),
  attendeeRole: z.enum(["parent", "athlete", "coach", "other"]),
  attendedYear: z.coerce.number().int().min(2000).max(currentYear).optional(),
  ratings: z.object({
    value: rating,
    instruction: rating,
    exposure: rating,
    organization: rating,
    overall: rating,
  }),
  title: z.string().trim().min(4, "Add a short headline").max(120),
  body: z.string().trim().min(40, "Tell other families a bit more (40+ characters)").max(5000),
  wouldRecommend: z.boolean().optional(),
  confirmAdult: z.literal(true, { errorMap: () => ({ message: "Reviewers must be 18 or older" }) }),
  confirmFirsthand: z.literal(true, {
    errorMap: () => ({ message: "Please confirm this is your own first-hand experience" }),
  }),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(0).optional().or(z.literal("")),
  /** Milliseconds the form was open; used for bot detection. */
  elapsedMs: z.coerce.number().int().min(0).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** Normalized text fingerprint used to catch copy-pasted reviews. */
export function bodyFingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  // FNV-1a 32-bit — fast, deterministic, good enough for duplicate detection.
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${norm.length}`;
}

export interface SpamAssessment {
  score: number; // 0 (clean) .. 10 (certain spam)
  reasons: string[];
  decision: "publish" | "moderate" | "reject";
}

const PROMO = /\b(promo code|discount code|use code|click here|buy now|dm me|whatsapp|telegram|crypto|bitcoin|casino)\b/i;

/**
 * Heuristic spam assessment. Clean reviews publish immediately (low friction);
 * borderline ones go to the moderation queue; obvious spam is rejected.
 */
export function assessSpam(input: Pick<ReviewInput, "title" | "body" | "ratings" | "website" | "elapsedMs">, ctx: {
  recentReviewsByUser?: number; // in the last 24h
  duplicateBodyExists?: boolean;
} = {}): SpamAssessment {
  const reasons: string[] = [];
  let score = 0;
  const text = `${input.title}\n${input.body}`;

  if (input.website) { score += 10; reasons.push("honeypot"); }
  if (input.elapsedMs != null && input.elapsedMs < 4000) { score += 4; reasons.push("submitted too quickly"); }
  const links = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  if (links > 0) { score += Math.min(6, links * 3); reasons.push("contains links"); }
  if (PROMO.test(text)) { score += 5; reasons.push("promotional language"); }
  if (/(.)\1{7,}/.test(text)) { score += 2; reasons.push("repeated characters"); }
  const letters = input.body.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) {
    score += 2; reasons.push("mostly capital letters");
  }
  const words = input.body.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 10 && new Set(words).size / words.length < 0.35) { score += 3; reasons.push("highly repetitive"); }
  if (/\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(text) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    score += 2; reasons.push("contains contact details");
  }
  const r = input.ratings;
  const all = [r.value, r.instruction, r.exposure, r.organization, r.overall];
  if (all.every((v) => v === all[0]) && (all[0] === 1 || all[0] === 5) && input.body.length < 80) {
    score += 1; reasons.push("uniform extreme ratings with little detail");
  }
  if (ctx.duplicateBodyExists) { score += 6; reasons.push("duplicate of another review"); }
  if ((ctx.recentReviewsByUser ?? 0) >= 5) { score += 4; reasons.push("many reviews in 24 hours"); }
  else if ((ctx.recentReviewsByUser ?? 0) >= 3) { score += 2; reasons.push("several reviews in 24 hours"); }

  score = Math.min(10, score);
  const decision = score >= 8 ? "reject" : score >= 3 ? "moderate" : "publish";
  return { score, reasons, decision };
}
