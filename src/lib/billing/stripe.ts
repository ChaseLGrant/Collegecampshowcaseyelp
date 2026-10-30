import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(key, { appInfo: { name: "Camp Check" } });
  return client;
}

/** Stripe moved current_period_end onto subscription items in newer API versions; read either. */
export function periodEnd(sub: Stripe.Subscription): number | null {
  const anySub = sub as unknown as { current_period_end?: number };
  if (typeof anySub.current_period_end === "number") return anySub.current_period_end;
  const ends = sub.items?.data?.map((i) => (i as unknown as { current_period_end?: number }).current_period_end).filter((n): n is number => typeof n === "number") ?? [];
  return ends.length ? Math.max(...ends) : null;
}
