import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "@/lib/ingestion/robots";
import { PoliteFetcher } from "@/lib/ingestion/fetcher";

const robots = `
User-agent: *
Disallow: /private
Allow: /private/camps
Disallow: /*.pdf$
Crawl-delay: 5

User-agent: CampCheckBot
Disallow: /registration
`;

describe("robots.txt", () => {
  it("uses the specific group for our bot", () => {
    const r = parseRobots(robots, "CampCheckBot/1.0");
    expect(isAllowed(r, "/registration/form")).toBe(false);
    expect(isAllowed(r, "/private")).toBe(true); // specific group replaces *
  });
  it("applies longest match, Allow wins ties, wildcards and anchors", () => {
    const r = parseRobots(robots, "OtherBot");
    expect(isAllowed(r, "/private/data")).toBe(false);
    expect(isAllowed(r, "/private/camps/summer")).toBe(true);
    expect(isAllowed(r, "/files/brochure.pdf")).toBe(false);
    expect(isAllowed(r, "/files/brochure.pdf?x=1")).toBe(true);
    expect(r.crawlDelaySeconds).toBe(5);
  });
  it("allows everything when robots.txt is empty", () => {
    expect(isAllowed(parseRobots("", "x"), "/anything")).toBe(true);
  });
});

function fakeFetch(routes: Record<string, { status: number; body: string; type?: string }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const r = routes[url] ?? { status: 404, body: "" };
    return new Response(r.body, { status: r.status, headers: { "content-type": r.type ?? "text/html" } });
  }) as typeof fetch;
}

describe("PoliteFetcher", () => {
  const noSleep = async () => {};
  it("refuses URLs disallowed by robots.txt", async () => {
    const f = new PoliteFetcher({ respectRobots: true, requestsPerMinute: 60, sleep: noSleep, fetchImpl: fakeFetch({
      "https://u.edu/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /camps" },
      "https://u.edu/camps": { status: 200, body: "ok" },
    }) });
    const r = await f.getText("https://u.edu/camps");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blocked).toBe(true);
  });
  it("treats 403 and 429 as blocked and does not bypass", async () => {
    const f = new PoliteFetcher({ respectRobots: true, requestsPerMinute: 60, sleep: noSleep, fetchImpl: fakeFetch({
      "https://u.edu/robots.txt": { status: 404, body: "" },
      "https://u.edu/a": { status: 403, body: "" },
      "https://u.edu/b": { status: 429, body: "" },
    }) });
    for (const p of ["a", "b"]) {
      const r = await f.getText(`https://u.edu/${p}`);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.blocked).toBe(true);
    }
  });
  it("stops on bot-challenge and login pages", async () => {
    const f = new PoliteFetcher({ respectRobots: false, requestsPerMinute: 60, sleep: noSleep, fetchImpl: fakeFetch({
      "https://s.com/x": { status: 200, body: "<html><div id='cf-challenge'>Checking your browser</div></html>" },
      "https://s.com/y": { status: 200, body: "<form><input type='password' name='p'></form>" },
    }) });
    expect((await f.getText("https://s.com/x")).ok).toBe(false);
    expect((await f.getText("https://s.com/y")).ok).toBe(false);
  });
  it("skips sites whose robots.txt errors (5xx)", async () => {
    const f = new PoliteFetcher({ respectRobots: true, requestsPerMinute: 60, sleep: noSleep, fetchImpl: fakeFetch({
      "https://down.edu/robots.txt": { status: 503, body: "" },
    }) });
    expect((await f.getText("https://down.edu/camps")).ok).toBe(false);
  });
  it("waits between requests to the same host", async () => {
    const waits: number[] = [];
    let t = 0;
    const f = new PoliteFetcher({ respectRobots: false, requestsPerMinute: 6, now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; }, fetchImpl: fakeFetch({
      "https://h.com/1": { status: 200, body: "a" }, "https://h.com/2": { status: 200, body: "b" },
    }) });
    await f.getText("https://h.com/1");
    await f.getText("https://h.com/2");
    expect(waits[0]).toBe(10000);
  });
  it("rejects non-http protocols and URL credentials", async () => {
    const f = new PoliteFetcher({ respectRobots: false, requestsPerMinute: 60, fetchImpl: fakeFetch({}) });
    expect((await f.getText("file:///etc/passwd")).ok).toBe(false);
    expect((await f.getText("https://user:pw@h.com/")).ok).toBe(false);
  });
});
