import "server-only";
import { checkBotId } from "botid/server";
import { json } from "@/lib/server/http";

export const BOT_BLOCKED_MESSAGE =
  "We couldn't verify this submission came from a person using a browser. Please refresh the page and try again.";

/** BotID only classifies traffic on Vercel; locally and in tests it's skipped (BotID returns "human" in dev anyway). */
export function botIdActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL === "1" && env.NODE_ENV === "production" && env.BOTID_DISABLED !== "1";
}

/**
 * Returns a 403 response when Vercel BotID classifies the request as a bot, otherwise null.
 * Verified good bots (search crawlers etc.) still can't post forms. If the BotID check itself
 * errors (service outage), the request is allowed through and the other guards (rate limits,
 * honeypot, spam rules, Turnstile when configured) still apply.
 */
export async function rejectIfBot(): Promise<Response | null> {
  if (!botIdActive()) return null;
  try {
    const v = await checkBotId();
    if (v.isBot) return json({ error: BOT_BLOCKED_MESSAGE }, 403);
    return null;
  } catch (e) {
    console.error("botid check failed:", (e as Error).message);
    return null;
  }
}
