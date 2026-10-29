import type { RawCandidate, SourceAdapter } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Reads "a.b.0.c" paths from JSON. */
export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Generic adapter for licensed providers and structured feeds.
 * config: { url, itemsPath: "data.events", fields: { name: "title", startDate: "dates.start", ... },
 *           authEnv: "PROVIDER_API_KEY", authHeader: "authorization", authPrefix: "Bearer " }
 * Credentials are referenced by env var name — never stored in the database.
 */
export function mapJsonItems(json: any, cfg: { itemsPath?: string; fields?: Record<string, string> }, feedUrl: string): RawCandidate[] {
  const items = cfg.itemsPath ? getPath(json, cfg.itemsPath) : json;
  if (!Array.isArray(items)) throw new Error(`itemsPath "${cfg.itemsPath ?? ""}" did not resolve to an array`);
  const fields = cfg.fields ?? {};
  return items.slice(0, 5000).map((it) => {
    const c: Record<string, any> = {};
    for (const [target, path] of Object.entries(fields)) {
      const v = getPath(it, path);
      if (v != null) c[target] = v;
    }
    if (!c.sourceUrl) c.sourceUrl = feedUrl;
    return c as RawCandidate;
  });
}

export const jsonFeedAdapter: SourceAdapter = {
  async discover(source, ctx) {
    const cfg = source.config as { url?: string; itemsPath?: string; fields?: Record<string, string>; authEnv?: string; authHeader?: string; authPrefix?: string };
    const url = cfg.url ?? source.baseUrl;
    if (!url) throw new Error("JSON feed needs config.url");
    let text: string;
    if (cfg.authEnv) {
      // Licensed APIs: authenticated with credentials the provider issued to us (not bypassing anything).
      const key = process.env[cfg.authEnv];
      if (!key) throw new Error(`Missing credential env var ${cfg.authEnv} — integration not live`);
      const res = await fetch(url, {
        headers: { [cfg.authHeader ?? "authorization"]: `${cfg.authPrefix ?? "Bearer "}${key}`, accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`Provider responded ${res.status}`);
      text = await res.text();
    } else {
      const res = await ctx.fetcher.getText(url);
      if (!res.ok) throw new Error(res.reason);
      text = res.text;
    }
    return mapJsonItems(JSON.parse(text), cfg, url);
  },
};
