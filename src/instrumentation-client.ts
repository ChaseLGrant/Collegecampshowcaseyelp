import { initBotId } from "botid/client/core";
import { BOT_PROTECTED_ROUTES } from "@/lib/security/protected-routes";

// Vercel BotID: invisible bot detection on Camp Check's public forms (reviews, reports,
// camp submissions, lead capture). No keys needed; local dev is handled by BotID itself.
initBotId({ protect: BOT_PROTECTED_ROUTES.map((r) => ({ path: r.path, method: r.method })) });
