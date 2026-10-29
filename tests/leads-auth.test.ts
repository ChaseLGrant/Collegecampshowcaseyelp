import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvCell, leadInputSchema, leadsToCsv, type LeadRow } from "../src/lib/leads";

const base = { email: "Parent@Example.com", role: "parent", sport: "baseball", consent: true };

describe("lead capture validation", () => {
  it("accepts a minimal camp-alert sign-up and normalizes email", () => {
    const r = leadInputSchema.safeParse({ ...base, gradYear: "2028" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("parent@example.com");
      expect(r.data.gradYear).toBe(2028);
      expect(r.data.interest).toBe("camp_alerts");
      expect(r.data.phone).toBeNull();
    }
  });
  it("requires consent", () => {
    expect(leadInputSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });
  it("rejects unknown sports, roles and bad phone numbers", () => {
    expect(leadInputSchema.safeParse({ ...base, sport: "curling" }).success).toBe(false);
    expect(leadInputSchema.safeParse({ ...base, role: "scout" }).success).toBe(false);
    expect(leadInputSchema.safeParse({ ...base, phone: "call me maybe" }).success).toBe(false);
    expect(leadInputSchema.safeParse({ ...base, phone: "(760) 555-0100" }).success).toBe(true);
  });
  it("only allows slug-shaped camp references", () => {
    expect(leadInputSchema.safeParse({ ...base, campSlug: "abc-camp-2026" }).success).toBe(true);
    expect(leadInputSchema.safeParse({ ...base, campSlug: "../admin" }).success).toBe(false);
  });
});

describe("lead CSV export", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
  it("writes a header row and one line per lead", () => {
    const row = { id: "x", name: "Pat", email: "p@x.com", phone: null, role: "parent", grad_year: 2028, sport: "baseball", interest: "coach_call",
      source_page: "/camps/a", camp_slug: "a", consent: true, consent_at: "2026-10-29T00:00:00.000Z", submission_count: 1,
      created_at: "2026-10-29T00:00:00.000Z", updated_at: "2026-10-29T00:00:00.000Z" } satisfies LeadRow;
    const csv = leadsToCsv([row]).trim().split("\r\n");
    expect(csv).toHaveLength(2);
    expect(csv[0].startsWith("created_at,updated_at,name,email")).toBe(true);
    expect(csv[1]).toContain("p@x.com");
  });
});

describe("server-side authorization (replaces RLS)", () => {
  const root = path.resolve(__dirname, "../src/app");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
  it("every admin page and route checks the staff role", () => {
    const admin = files(path.join(root, "admin")).filter((f) => /(page|route|layout)\.tsx?$/.test(f));
    expect(admin.length).toBeGreaterThan(10);
    for (const f of admin) expect(readFileSync(f, "utf8"), f).toMatch(/requireStaff\(|isStaff\(/);
  });
  it("every admin server action checks the staff role", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/actions/admin.ts"), "utf8");
    const exported = src.match(/export async function \w+/g) ?? [];
    const guarded = src.match(/export async function \w+\([^)]*\) \{\n\s+const \{[^}]+\} = await requireStaff\(/g) ?? [];
    expect(exported.length).toBeGreaterThan(10);
    expect(guarded.length).toBe(exported.length);
  });
  it("user-scoped write routes require a session", () => {
    for (const r of ["api/reviews/route.ts", "api/reviews/proof/route.ts", "api/reviews/report/route.ts", "api/billing/checkout/route.ts", "api/billing/portal/route.ts", "api/athlete-market/link/route.ts"]) {
      expect(readFileSync(path.join(root, r), "utf8"), r).toMatch(/getSessionUser\(\)/);
    }
  });
  it("no Supabase code remains", () => {
    for (const f of files(path.resolve(__dirname, "../src"))) expect(readFileSync(f, "utf8"), f).not.toMatch(/@supabase|getServerSupabase|getServiceSupabase/);
  });
});
