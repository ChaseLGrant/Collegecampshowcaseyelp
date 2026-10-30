import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import logoData from "../src/lib/logos.data.json";
import { faviconUrl, findLogoEntry, isGenericHost, normalizeOrgName, organizerDomain, orgInitials, resolveCampLogo } from "../src/lib/logos";

describe("logo data", () => {
  it("every mapped logo file exists in public/", () => {
    for (const e of logoData as { name: string; logo: string }[]) {
      expect(fs.existsSync(path.join(__dirname, "..", "public", e.logo)), `${e.name} -> ${e.logo}`).toBe(true);
    }
  });

  it("no alias points at two different logos", () => {
    const seen = new Map<string, string>();
    for (const e of logoData as { name: string; logo: string; aliases?: string[] }[]) {
      for (const n of [e.name, ...(e.aliases ?? [])]) {
        const k = normalizeOrgName(n);
        if (seen.has(k)) expect(seen.get(k), `duplicate key "${k}"`).toBe(e.logo);
        seen.set(k, e.logo);
      }
    }
  });
});

describe("findLogoEntry", () => {
  it.each([
    ["Perfect Game", "Perfect Game"],
    ["PG", "Perfect Game"],
    ["Prep Baseball Report", "Prep Baseball Report"],
    ["Prep Baseball (PBR) California", "Prep Baseball Report"],
    ["PBR", "Prep Baseball Report"],
    ["University of California San Diego", "University of California San Diego"],
    ["UC San Diego", "University of California San Diego"],
    ["Pepperdine University", "Pepperdine University"],
    ["University of Oregon", "University of Oregon"],
    ["Ohio State University", "The Ohio State University"],
    ["California State University, San Marcos", "Cal State San Marcos"],
    ["Cal State Fullerton - Softball Camps LLC", "Cal State Fullerton"],
    ["Section 7 (ABCA / Arizona Sports & Entertainment Commission)", "Section 7"],
    ["Elite Basketball Circuit x Ballislife", "Elite Basketball Circuit"],
  ])("%s -> %s", (input, expected) => {
    expect(findLogoEntry(input)?.name).toBe(expected);
  });

  it("returns null for unknown names", () => {
    expect(findLogoEntry("Totally New Hoops Academy")).toBeNull();
    expect(findLogoEntry(null)).toBeNull();
  });
});

describe("resolveCampLogo", () => {
  it("prefers the institution, then the organizer", () => {
    const l = resolveCampLogo({ institutionName: "Pepperdine University", organizerName: "Malibu Baseball Camps (Pepperdine)" });
    expect(l.kind).toBe("local");
    if (l.kind === "local") expect(l.src).toBe("/logos/pepperdine-university.png");
    const o = resolveCampLogo({ institutionName: null, organizerName: "Perfect Game" });
    expect(o.kind === "local" && o.src).toBe("/logos/perfect-game.png");
  });

  it("falls back to the organizer's own domain icon for unmapped organizers", () => {
    const l = resolveCampLogo({ organizerName: "Brand New Showcase Co", registrationUrl: "https://www.brandnewshowcase.com/register" });
    expect(l).toMatchObject({ kind: "favicon", domain: "brandnewshowcase.com", initials: "BNS" });
    if (l.kind === "favicon") expect(l.src).toBe(faviconUrl("brandnewshowcase.com"));
  });

  it("skips generic registration hosts and uses the source URL or initials", () => {
    expect(resolveCampLogo({ organizerName: "New Org", registrationUrl: "https://register.ryzer.com/camp.cfm?id=1", sourceUrl: "https://neworg.org/camps" }))
      .toMatchObject({ kind: "favicon", domain: "neworg.org" });
    expect(resolveCampLogo({ organizerName: "New Org", registrationUrl: "https://docs.google.com/forms/d/x", sourceUrl: "https://www.eventbrite.com/e/1" }))
      .toMatchObject({ kind: "initials", initials: "NO" });
  });
});

describe("helpers", () => {
  it("detects generic hosts including subdomains", () => {
    expect(isGenericHost("stanfordcamps.totalcamps.com")).toBe(true);
    expect(isGenericHost("forms.gle")).toBe(true);
    expect(isGenericHost("perfectgame.org")).toBe(false);
    expect(organizerDomain({ registrationUrl: "javascript:alert(1)", sourceUrl: null })).toBeNull();
  });

  it("builds initials", () => {
    expect(orgInitials("Perfect Game")).toBe("PG");
    expect(orgInitials("Premier Girls Fastpitch (PGF)")).toBe("PGF");
    expect(orgInitials("UCLA")).toBe("UCLA");
    expect(orgInitials("University of New Hampshire")).toBe("NH");
    expect(orgInitials(null)).toBe("?");
  });
});
