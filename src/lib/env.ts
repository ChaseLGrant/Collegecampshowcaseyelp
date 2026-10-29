/** Centralized environment access. Server-only secrets are never read in client code. */
export const env = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
};

/** Postgres (Railway) connection string is set. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Auth.js can issue sessions (needs a database for users and a signing secret). */
export function authConfigured(): boolean {
  return databaseConfigured() && Boolean(process.env.AUTH_SECRET);
}

export function googleAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/**
 * Labeled sample data. With no database it is on unless CAMPGRADE_DEMO_DATA=false.
 * With a database it is used only as a fallback while the database has no published
 * camps AND CAMPGRADE_DEMO_DATA=true — real camps always win once loaded.
 */
export function demoDataEnabled(): boolean {
  if (!databaseConfigured()) return process.env.CAMPGRADE_DEMO_DATA !== "false";
  return process.env.CAMPGRADE_DEMO_DATA === "true";
}

export function storageConfigured(): boolean {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function athleteMarketConfigured(): boolean {
  return Boolean(
    process.env.ATHLETE_MARKET_BASE_URL &&
      process.env.ATHLETE_MARKET_CLIENT_ID &&
      process.env.ATHLETE_MARKET_SHARED_SECRET,
  );
}

/** Where Roster Insider / eval-call CTAs send people until Stripe prices exist. */
export function insiderCtaUrl(): string {
  const v = process.env.INSIDER_CTA_URL?.trim();
  return v && /^https?:\/\//.test(v) ? v : "https://theathletemarket.com";
}

/** "Free eval review call" link. Defaults to the Insider CTA URL. */
export function evalCallUrl(): string {
  const v = process.env.EVAL_CALL_URL?.trim();
  return v && /^https?:\/\//.test(v) ? v : insiderCtaUrl();
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
