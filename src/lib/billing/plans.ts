export type Tier = "free" | "insider" | "elite";
export const TIER_RANK: Record<Tier, number> = { free: 0, insider: 1, elite: 2 };

export const FEATURES = {
  search: "Camp search",
  basic_listings: "Basic event listings",
  community_reviews: "Community reviews",
  basic_ratings: "Basic event ratings",
  review_submission: "Review submission",
  compare_basic: "Compare up to 2 camps",
  premium_research: "Premium camp research",
  advanced_compare: "Advanced comparison (up to 4 camps)",
  saved_lists: "Saved camp lists",
  recruiting_intel: "Additional recruiting intelligence",
  camp_matching: "Personalized camp matching",
  school_targeting: "School-targeting recommendations",
  premium_reports: "Premium reports",
  notifications: "Notifications",
} as const;
export type Feature = keyof typeof FEATURES;

/** Default feature → minimum tier map. The plans table can override per plan. */
export const DEFAULT_FEATURE_TIER: Record<Feature, Tier> = {
  search: "free", basic_listings: "free", community_reviews: "free", basic_ratings: "free",
  review_submission: "free", compare_basic: "free",
  premium_research: "insider", advanced_compare: "insider", saved_lists: "insider", recruiting_intel: "insider",
  camp_matching: "elite", school_targeting: "elite", premium_reports: "elite", notifications: "elite",
};

export interface Plan {
  id: string;
  tier: Tier;
  name: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  billingInterval: "month" | "year";
  stripePriceId: string | null;
  athleteMarketProductKey: string | null;
  features: Feature[];
  highlights: string[];
  active: boolean;
  sortOrder: number;
}

const featuresUpTo = (tier: Tier) =>
  (Object.keys(DEFAULT_FEATURE_TIER) as Feature[]).filter((f) => TIER_RANK[DEFAULT_FEATURE_TIER[f]] <= TIER_RANK[tier]);

/** Fallback plans when the database is unavailable. Prices are starting values, editable in /admin/plans. */
export const DEFAULT_PLANS: Plan[] = [
  { id: "free", tier: "free", name: "Free Community Access", tagline: "Search, read and write reviews — always free.", priceCents: 0, currency: "usd", billingInterval: "month", stripePriceId: null, athleteMarketProductKey: null, features: featuresUpTo("free"), highlights: ["Camp search across every sport", "Basic event listings", "Community reviews and ratings", "Write reviews"], active: true, sortOrder: 0 },
  { id: "insider", tier: "insider", name: "Recruiting Insider", tagline: "Premium camp research and comparison tools.", priceCents: 1999, currency: "usd", billingInterval: "month", stripePriceId: null, athleteMarketProductKey: "recruiting_insider", features: featuresUpTo("insider"), highlights: ["Everything in Free", "Premium camp research summaries", "Advanced side-by-side comparison", "Saved camp lists", "Included with The Athlete Market Recruiting Insider"], active: true, sortOrder: 1 },
  { id: "elite", tier: "elite", name: "Insider Elite", tagline: "Personalized matching and advanced recruiting intelligence.", priceCents: 9900, currency: "usd", billingInterval: "month", stripePriceId: null, athleteMarketProductKey: "insider_elite", features: featuresUpTo("elite"), highlights: ["Everything in Recruiting Insider", "Personalized camp matching", "School-targeting recommendations", "Premium reports and notifications", "Included with The Athlete Market Insider Elite"], active: true, sortOrder: 2 },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapPlanRow(r: any): Plan {
  return {
    id: r.id, tier: r.tier, name: r.name, tagline: r.tagline ?? null, priceCents: r.price_cents,
    currency: r.currency, billingInterval: r.billing_interval, stripePriceId: r.stripe_price_id ?? null,
    athleteMarketProductKey: r.athlete_market_product_key ?? null,
    features: (r.features ?? []).filter((f: string) => f in FEATURES), highlights: r.highlights ?? [],
    active: r.active, sortOrder: r.sort_order,
  };
}
