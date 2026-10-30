import { describe, expect, it, vi } from "vitest";
import {
  assessSpam, containsContactInfo, containsLink, containsPhone, guestHoldReasons, hasRepetition, isGibberish, isMostlyUppercase,
} from "@/lib/reviews/validation";
import { TURNSTILE_VERIFY_URL, turnstileEnabled, verifyTurnstile } from "@/lib/security/turnstile";
import { BOT_PROTECTED_ROUTES } from "@/lib/security/protected-routes";

const good = {
  title: "Well run, good instruction",
  body: "The staff ran position groups all morning and the coaches gave every kid individual feedback before the game. Worth the drive.",
  ratings: { value: 4, instruction: 5, exposure: 3, organization: 4, overall: 4 },
  elapsedMs: 90000,
};
const guest = (patch: Partial<typeof good> = {}, ctx: { guestRecentFromIp?: number } = {}) =>
  assessSpam({ ...good, ...patch }, { guest: true, ...ctx });

describe("guest content rules", () => {
  it("publishes a clean guest review", () => {
    const r = guest();
    expect(r.decision).toBe("publish");
    expect(r.reasons).toEqual([]);
  });

  it("holds guest reviews with links, including bare domains", () => {
    expect(guest({ body: `${good.body} More at campdeals.net for details.` }).decision).toBe("moderate");
    expect(guest({ body: `${good.body} see www.example.org` }).decision).toBe("moderate");
    expect(containsLink("Visit http://x.y")).toBe(true);
    expect(containsLink("We drove 3.5 hours. It was great.")).toBe(false);
  });

  it("holds guest reviews with emails, phone numbers or handles", () => {
    expect(guest({ body: `${good.body} Email me at coach.dan@gmail.com` }).decision).toBe("moderate");
    expect(guest({ body: `${good.body} Text (760) 555-1234 for info` }).decision).toBe("moderate");
    expect(guest({ body: `${good.body} call +1 760.555.1234` }).decision).toBe("moderate");
    expect(guest({ body: `${good.body} write me dan at gmail dot com` }).decision).toBe("moderate");
    expect(guest({ body: `${good.body} follow @recruitguru_99 on IG` }).decision).toBe("moderate");
    expect(containsPhone("Cost was $1,295 for 3 days in 2025")).toBe(false);
    expect(containsContactInfo("Camp ran 9-3 each day, 2024 session")).toBe(false);
  });

  it("holds mostly uppercase guest reviews but allows acronyms", () => {
    expect(guest({ body: "THIS CAMP WAS A TOTAL SCAM AND THE COACHES NEVER SHOWED UP FOR ANY OF THE SESSIONS" }).decision).toBe("moderate");
    expect(isMostlyUppercase("Great D1 and NAIA coaches from UCLA, USD and SDSU were there all weekend.")).toBe(false);
  });

  it("holds repeated characters and words", () => {
    expect(guest({ body: `${good.body} Sooooooo good!!!` }).decision).toBe("moderate");
    expect(hasRepetition("great great great camp for my son and his friends this summer")).toBe(true);
    expect(hasRepetition("best camp best camp best camp best camp best camp best camp")).toBe(true);
    expect(hasRepetition(good.body)).toBe(false);
  });

  it("holds gibberish", () => {
    expect(isGibberish("asdfgh qwerty zxcvbn lkjhgf poiuyt mnbvcx")).toBe(true);
    expect(isGibberish("xkcd brrrt pfffft grrrhh zzzkk thhppt qwrtp")).toBe(true);
    expect(isGibberish("dhfjskdlfh sjdkfhsk djfhskdjfh sdkjfhskdjf hskdjfhs")).toBe(true);
    expect(guest({ body: "jfkdls fjdksl fjdksla fjdkslaj fkdlsajf kdlsajfk dlsajfkd lsajfkdl" }).decision).toBe("moderate");
    expect(isGibberish(good.body)).toBe(false);
    expect(isGibberish("Rhythm drills, strength training and lots of hitting. My son loved the staff.")).toBe(false);
  });

  it("holds a second guest review from the same IP within 24h (any camp)", () => {
    const r = guest({}, { guestRecentFromIp: 1 });
    expect(r.decision).toBe("moderate");
    expect(r.reasons.join(" ")).toMatch(/last 24 hours/);
    expect(guest({}, { guestRecentFromIp: 0 }).decision).toBe("publish");
  });

  it("never downgrades a reject to a hold", () => {
    expect(guest({ ...good, website: "x" } as typeof good).decision).toBe("reject");
  });

  it("lists every hold reason for moderators", () => {
    const reasons = guestHoldReasons({ title: "BUY NOW", body: "CALL 760-555-1234 OR VISIT WWW.SPAM.COM NOW NOW NOW!!!!!!!!" });
    expect(reasons).toEqual(expect.arrayContaining(["contains links", "contains contact details", "mostly capital letters", "repeated characters or words"]));
  });
});

describe("members keep the existing behavior", () => {
  it("publishes member reviews that guests would have held", () => {
    expect(assessSpam({ ...good, body: `${good.body} Sooooooo good!!!` }).decision).toBe("publish");
    expect(assessSpam({ ...good, body: `${good.body} Email me at coach.dan@gmail.com` }).decision).toBe("publish");
    expect(assessSpam(good, { guestRecentFromIp: 3 }).decision).toBe("publish");
  });
});

describe("Turnstile verification", () => {
  const env = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
  const okFetch = (payload: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));

  it("is off unless both keys are set", async () => {
    expect(turnstileEnabled({})).toBe(false);
    expect(turnstileEnabled({ TURNSTILE_SECRET_KEY: "s" })).toBe(false);
    expect(turnstileEnabled({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" })).toBe(false);
    expect(turnstileEnabled(env)).toBe(true);
    const f = okFetch({ success: false });
    expect(await verifyTurnstile(undefined, { env: {}, fetchImpl: f })).toEqual({ ok: true, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("fails without a token when enabled", async () => {
    const f = okFetch({ success: true });
    const r = await verifyTurnstile("", { env, fetchImpl: f });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("posts secret, token and IP to siteverify and accepts success", async () => {
    const f = okFetch({ success: true });
    const r = await verifyTurnstile("tok123", { env, fetchImpl: f, remoteIp: "1.2.3.4" });
    expect(r).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("tok123");
    expect(sent.get("remoteip")).toBe("1.2.3.4");
  });

  it("rejects failed, errored and unreachable verifications", async () => {
    expect((await verifyTurnstile("t", { env, fetchImpl: okFetch({ success: false, "error-codes": ["invalid-input-response"] }) })))
      .toEqual({ ok: false, errorCodes: ["invalid-input-response"] });
    expect((await verifyTurnstile("t", { env, fetchImpl: okFetch({}, 500) })).ok).toBe(false);
    const boom = vi.fn(async () => { throw new Error("down"); });
    expect((await verifyTurnstile("t", { env, fetchImpl: boom as unknown as typeof fetch })).errorCodes).toEqual(["network-error"]);
  });
});

describe("BotID protected routes", () => {
  it("covers every public form endpoint", () => {
    const paths = BOT_PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual(expect.arrayContaining(["POST /api/reviews", "POST /api/reviews/report", "POST /api/camps/submit", "POST /api/leads"]));
  });
});
