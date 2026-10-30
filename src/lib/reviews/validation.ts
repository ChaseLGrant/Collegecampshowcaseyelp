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
  /** Posted without an account. Guests get the stricter hold rules in guestHoldReasons(). */
  guest?: boolean;
  /** Guest reviews already posted from this IP in the last 24h, on any camp. */
  guestRecentFromIp?: number;
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
  let decision: SpamAssessment["decision"] = score >= 8 ? "reject" : score >= 3 ? "moderate" : "publish";

  // Guests (no account) are held for a moderator on any of these signals instead of publishing.
  // Members keep the scoring above unchanged.
  if (ctx.guest) {
    const hold = guestHoldReasons(input, { recentFromIp: ctx.guestRecentFromIp });
    for (const h of hold) if (!reasons.includes(h)) reasons.push(h);
    if (hold.length && decision === "publish") {
      decision = "moderate";
      score = Math.max(score, 3);
    }
  }
  return { score, reasons, decision };
}

/* ------------------------------------------------------------------ */
/* Stricter content rules for guest (signed-out) reviews               */
/* ------------------------------------------------------------------ */

const URL_RE = /https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|ly|xyz|info|biz|me|us|app|site|online|shop|link|gg|tv|ru|cn)\b/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\b[\w.+-]+\s*(?:\(at\)|\[at\]|\sat\s)\s*[\w-]+\s*(?:\(dot\)|\[dot\]|\sdot\s|\.)\s*(?:com|net|org|edu)\b/i;
const HANDLE_RE = /(?:^|\s)@[a-z0-9_.]{3,}/i;

/** Phone numbers: 10+ digits in a phone-like group, e.g. 760-555-1234, (760) 555 1234, +1 760.555.1234. */
export function containsPhone(text: string): boolean {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) ?? [];
  return candidates.some((c) => {
    const digits = c.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  });
}

export function containsContactInfo(text: string): boolean {
  return EMAIL_RE.test(text) || containsPhone(text) || HANDLE_RE.test(text);
}

export function containsLink(text: string): boolean {
  return URL_RE.test(text);
}

/** More than half of the letters are capitals (needs 20+ letters so short acronyms don't count). */
export function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 20) return false;
  return letters.replace(/[^A-Z]/g, "").length / letters.length > 0.5;
}

/** "soooooo", "aaaaaa", "!!!!!!!!", "great great great", or a few words repeated over and over. */
export function hasRepetition(text: string): boolean {
  if (/([a-z])\1{4,}/i.test(text)) return true; // same letter 5+ times in a row ("$100000" is fine)
  if (/([^\sa-z0-9])\1{7,}/i.test(text)) return true; // punctuation 8+ times
  if (/\b(\w+)(?:\W+\1\b){2,}/i.test(text)) return true; // same word 3+ times in a row
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length >= 10 && new Set(words).size / words.length < 0.4) return true;
  if (words.length >= 12) {
    const counts = new Map<string, number>();
    for (const w of words) if (w.length >= 4) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const n of counts.values()) if (n / words.length >= 0.25) return true;
  }
  return false;
}

const KEYBOARD_MASH = /(?:qwert|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|wasd|qazwsx|jkjk|lkjh|poiu|mnbv)/i;

/**
 * Keyboard mashing / random letters: words with no vowels or long consonant runs,
 * very long "words", vowel ratios no real English has, or keyboard rows.
 */
export function isGibberish(text: string): boolean {
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []);
  if (words.length < 3) return false;
  const letters = words.join("");
  if (letters.length < 25) return false;
  const mashHits = words.filter((w) => KEYBOARD_MASH.test(w)).length;
  if (mashHits >= 2 || (mashHits >= 1 && words.length < 12)) return true;
  const vowels = (letters.match(/[aeiouy]/g) ?? []).length / letters.length;
  if (vowels < 0.22 || vowels > 0.68) return true;
  const longWords = words.filter((w) => w.length >= 4);
  if (!longWords.length) return false;
  const odd = longWords.filter((w) => w.length > 22 || !/[aeiouy]/.test(w) || /[bcdfghjklmnpqrstvwxz]{5,}/.test(w)).length;
  return odd / longWords.length > 0.2;
}

/** Reasons to hold a guest review for moderation (empty = may publish). */
export function guestHoldReasons(
  input: Pick<ReviewInput, "title" | "body">,
  ctx: { recentFromIp?: number } = {},
): string[] {
  const text = `${input.title}\n${input.body}`;
  const out: string[] = [];
  if (containsLink(text)) out.push("contains links");
  if (containsContactInfo(text)) out.push("contains contact details");
  if (isMostlyUppercase(input.body) || isMostlyUppercase(input.title + " " + input.body)) out.push("mostly capital letters");
  if (hasRepetition(text)) out.push("repeated characters or words");
  if (isGibberish(input.body) || isGibberish(input.title)) out.push("looks like gibberish");
  if ((ctx.recentFromIp ?? 0) >= 1) out.push("another guest review from this connection in the last 24 hours");
  return out;
}
