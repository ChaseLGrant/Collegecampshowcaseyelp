/**
 * Public POST endpoints protected by Vercel BotID. The client (instrumentation-client.ts)
 * attaches BotID headers to these requests; the routes call checkBotId() via rejectIfBot().
 * A route listed here MUST be fetched from a page in the app — direct curl calls are
 * classified as bots in production.
 */
export const BOT_PROTECTED_ROUTES = [
  { path: "/api/reviews", method: "POST" },
  { path: "/api/reviews/report", method: "POST" },
  { path: "/api/camps/submit", method: "POST" },
  { path: "/api/leads", method: "POST" },
] as const;
