import { isAllowed, parseRobots, type RobotsRules } from "./robots";
import type { FetchLike } from "./types";

export const BOT_USER_AGENT = `CampGradeBot/1.0 (+${(process.env.NEXT_PUBLIC_SITE_URL || "https://campgrade.example").replace(/\/$/, "")}/bot)`;
const MAX_BYTES = 2_000_000;

/** Markers of bot-protection / challenge pages. We stop instead of trying to get past them. */
const CHALLENGE_MARKERS = [/cf-challenge|challenge-platform|cf_chl_/i, /captcha/i, /access denied/i, /please enable javascript and cookies/i];

/**
 * Polite fetcher: honors robots.txt and crawl-delay, rate-limits per host,
 * identifies itself honestly, sends no cookies or credentials, and treats
 * 401/403/429, logins and challenge pages as "blocked" — never retried or bypassed.
 */
export class PoliteFetcher implements FetchLike {
  private robotsCache = new Map<string, RobotsRules | "unreachable">();
  private lastHit = new Map<string, number>();

  constructor(
    private opts: {
      respectRobots: boolean;
      requestsPerMinute: number;
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    },
  ) {}

  private get f() { return this.opts.fetchImpl ?? fetch; }
  private sleep(ms: number) { return (this.opts.sleep ?? ((m) => new Promise((r) => setTimeout(r, m))))(ms); }
  private now() { return (this.opts.now ?? Date.now)(); }

  private async robotsFor(origin: string): Promise<RobotsRules | "unreachable"> {
    const cached = this.robotsCache.get(origin);
    if (cached) return cached;
    let rules: RobotsRules | "unreachable";
    try {
      const res = await this.f(`${origin}/robots.txt`, {
        headers: { "user-agent": BOT_USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(10000),
      });
      if (res.status >= 400 && res.status < 500) rules = { rules: [], crawlDelaySeconds: null }; // no robots = allowed
      else if (!res.ok) rules = "unreachable"; // 5xx: be conservative, don't crawl
      else rules = parseRobots(await res.text(), BOT_USER_AGENT);
    } catch {
      rules = "unreachable";
    }
    this.robotsCache.set(origin, rules);
    return rules;
  }

  async getText(url: string) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false as const, reason: "invalid URL", blocked: false };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false as const, reason: "unsupported protocol", blocked: false };
    if (u.username || u.password) return { ok: false as const, reason: "credentials in URL are not allowed", blocked: true };

    let delayMs = 60000 / Math.max(1, this.opts.requestsPerMinute);
    if (this.opts.respectRobots) {
      const robots = await this.robotsFor(u.origin);
      if (robots === "unreachable") return { ok: false as const, reason: "robots.txt unreachable; skipping to be safe", blocked: true };
      if (!isAllowed(robots, u.pathname + u.search)) return { ok: false as const, reason: "disallowed by robots.txt", blocked: true };
      if (robots.crawlDelaySeconds) delayMs = Math.max(delayMs, robots.crawlDelaySeconds * 1000);
    }

    const last = this.lastHit.get(u.host);
    if (last != null) {
      const wait = last + delayMs - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastHit.set(u.host, this.now());

    let res: Response;
    try {
      res = await this.f(u.toString(), {
        headers: { "user-agent": BOT_USER_AGENT, accept: "text/html,application/json,text/calendar,text/csv;q=0.9,*/*;q=0.5" },
        redirect: "follow",
        credentials: "omit",
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return { ok: false as const, reason: `network error: ${(e as Error).message}`, blocked: false };
    }
    if (res.status === 401 || res.status === 403) return { ok: false as const, reason: `access restricted (${res.status})`, blocked: true };
    if (res.status === 429) return { ok: false as const, reason: "rate limited by site (429); will not retry this run", blocked: true };
    if (!res.ok) return { ok: false as const, reason: `HTTP ${res.status}`, blocked: false };

    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return { ok: false as const, reason: "response too large", blocked: false };
    const text = (await res.text()).slice(0, MAX_BYTES);
    if (CHALLENGE_MARKERS.some((m) => m.test(text.slice(0, 5000))) && !/application\/json|text\/calendar|text\/csv/.test(res.headers.get("content-type") ?? "")) {
      return { ok: false as const, reason: "bot-protection or login page detected; not bypassing", blocked: true };
    }
    if (/<input[^>]+type=["']?password/i.test(text)) {
      return { ok: false as const, reason: "login page detected; not bypassing", blocked: true };
    }
    return { ok: true as const, text, url: res.url || u.toString() };
  }
}
