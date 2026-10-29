/** Centralized environment access. Server-only secrets are never read in client code. */
export const env = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

export function supabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function serviceRoleConfigured(): boolean {
  return supabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Sample data is shown only when no database is configured and it hasn't been disabled. */
export function demoDataEnabled(): boolean {
  return !supabaseConfigured() && process.env.CAMPGRADE_DEMO_DATA !== "false";
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

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
