import { z } from "zod";

/** Guest reviewers get a synthetic, unroutable address on a reserved (.invalid) domain. */
export const GUEST_EMAIL_DOMAIN = "guest.campgrade.invalid";

export function guestEmailFor(uuid: string): string {
  return `guest+${uuid}@${GUEST_EMAIL_DOMAIN}`;
}

/** True for any address on the reserved guest domain — such addresses can never sign in or register. */
export function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}

/** Optional guest fields on the review POST. guestName is required when there is no session (checked in the route). */
export const guestFieldsSchema = z.object({
  guestName: z.string().trim().min(2, "Add your name (at least 2 characters)").max(60, "Use 60 characters or fewer for your name")
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, "Use letters only for your name").optional(),
  guestEmail: z.union([z.string().trim().toLowerCase().email("Enter a valid email or leave it blank").max(254), z.literal("")]).optional()
    .transform((v) => v || undefined),
});

/** "Sarah Miller" → "Sarah M." ; "sarah" → "Sarah". Keeps public names short (first name + last initial). */
export function shortDisplayName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
  const first = cap(parts[0]).slice(0, 40);
  if (parts.length === 1) return first;
  const lastInitial = parts[parts.length - 1].replace(/[^\p{L}]/gu, "").charAt(0).toLocaleUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
