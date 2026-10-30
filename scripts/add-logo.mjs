#!/usr/bin/env node
// Add (or replace) an organizer/school logo for camp cards and camp pages.
//
// Usage:
//   node scripts/add-logo.mjs "<Organizer or school name>" <logo-url-or-local-file> [--alias "<other name>"]... [--bg "#111827"] [--force] [--dry-run]
//   node scripts/add-logo.mjs --check <camps.json> [more.json ...]   # list organizers/schools in import files that have no logo yet
//
// What it does:
//   1. Downloads the image (png/jpg/webp/gif/svg/ico) or reads a local file.
//   2. Trims empty borders, fits it into 256x256 and writes public/logos/<slug>.png (sharp; falls back to saving
//      the original bytes with their own extension if sharp is unavailable).
//   3. Adds/updates the entry in src/lib/logos.data.json  { name, logo, aliases, bg?, source }.
// Matching in the app is on the camp's institution name first, then organizer name, normalized (case, punctuation,
// "&", leading "The"), also trying the name without "(...)" and the text inside "(...)". Add --alias for any other
// spelling the data uses (e.g. "PBR", "UC San Diego").
//
// Only use the organization's OWN logo (its website header/og:image/apple-touch-icon, or for colleges the official
// athletics mark). Use --bg for white/transparent marks that need a dark tile. Afterwards: npm test, then commit
// public/logos/<slug>.png + src/lib/logos.data.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src/lib/logos.data.json");
const OUT_DIR = path.join(ROOT, "public/logos");

const norm = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "").replace(/\s+/g, " ");
const keysFor = (name) => {
  const keys = [name];
  const stripped = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (stripped && stripped !== name) keys.push(stripped);
  for (const m of name.matchAll(/\(([^)]+)\)/g)) keys.push(m[1]);
  for (const part of stripped.split(/\s+[/–—-]\s+|\s*\/\s*/)) if (part && part !== stripped) keys.push(part);
  return keys.map(norm).filter(Boolean);
};
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const readData = () => JSON.parse(fs.readFileSync(DATA, "utf8"));
const indexOf = (entries) => {
  const m = new Map();
  for (const e of entries) for (const n of [e.name, ...(e.aliases ?? [])]) { const k = norm(n); if (k && !m.has(k)) m.set(k, e); }
  return m;
};
const find = (idx, name) => { if (!name) return null; for (const k of keysFor(name)) if (idx.has(k)) return idx.get(k); return null; };

function parse(argv) {
  const o = { positional: [], aliases: [], bg: null, force: false, dryRun: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--alias") o.aliases.push(argv[++i]);
    else if (a === "--bg") o.bg = argv[++i];
    else if (a === "--force") o.force = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--check") o.check = true;
    else o.positional.push(a);
  }
  return o;
}

async function loadBytes(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 (CampCheck logo fetcher)" }, redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(path.resolve(src));
}

function sniffExt(buf, src) {
  const head = buf.subarray(0, 512).toString("utf8").trimStart();
  if (head.startsWith("<") && head.includes("<svg")) return "svg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.subarray(0, 4).toString() === "RIFF") return "webp";
  if (buf.subarray(0, 3).toString() === "GIF") return "gif";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1) return "ico";
  return (path.extname(src.split("?")[0]).slice(1) || "bin").toLowerCase();
}

async function writeLogo(buf, ext, slug, dryRun) {
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch { /* optional */ }
  if (sharp && ext !== "ico") {
    const out = path.join(OUT_DIR, `${slug}.png`);
    const img = sharp(buf, { density: ext === "svg" ? 300 : undefined }).trim({ threshold: 10 }).resize(256, 256, { fit: "inside", withoutEnlargement: ext !== "svg" }).png({ compressionLevel: 9 });
    if (!dryRun) await img.toFile(out); else await img.toBuffer();
    return `/logos/${slug}.png`;
  }
  if (ext === "ico") console.warn("Note: .ico saved as-is; prefer a PNG/SVG logo when the site has one.");
  const out = path.join(OUT_DIR, `${slug}.${ext}`);
  if (!dryRun) fs.writeFileSync(out, buf);
  return `/logos/${slug}.${ext}`;
}

async function main() {
  const o = parse(process.argv.slice(2));

  if (o.check) {
    const idx = indexOf(readData());
    const missing = new Map();
    for (const f of o.positional) {
      const rows = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const c of Array.isArray(rows) ? rows : []) {
        const inst = c?.institution?.name ?? null, org = c?.organizer?.name ?? null;
        if (find(idx, inst) || find(idx, org)) continue;
        const key = inst ?? org; if (!key) continue;
        missing.set(key, { name: key, kind: inst ? "institution" : "organizer", website: c?.organizer?.website ?? c?.registration_url ?? null });
      }
    }
    if (!missing.size) { console.log("All organizers/schools in these files have a logo mapping."); return; }
    console.log(`${missing.size} without a logo (they show the organizer-site icon or initials until added):`);
    for (const m of missing.values()) console.log(`- [${m.kind}] ${m.name}${m.website ? `  (${m.website})` : ""}`);
    process.exitCode = 2;
    return;
  }

  const [name, src] = o.positional;
  if (!name || !src) {
    console.error('Usage: node scripts/add-logo.mjs "<Organizer name>" <logo-url-or-file> [--alias "..."]... [--bg "#111827"] [--force] [--dry-run]\n       node scripts/add-logo.mjs --check camps.json ...');
    process.exit(1);
  }
  if (o.bg && !/^#[0-9a-fA-F]{3,8}$/.test(o.bg)) { console.error("--bg must be a hex colour like #111827"); process.exit(1); }

  const entries = readData();
  const existing = entries.find((e) => norm(e.name) === norm(name));
  const clash = find(indexOf(entries), name);
  if (clash && clash !== existing && !o.force) {
    console.error(`"${name}" already resolves to the logo for "${clash.name}" (${clash.logo}). Use --force to add a separate entry anyway.`);
    process.exit(1);
  }

  const buf = await loadBytes(src);
  const ext = sniffExt(buf, src);
  if (!["png", "jpg", "jpeg", "webp", "gif", "svg", "ico", "avif"].includes(ext)) throw new Error(`Not an image (${ext}): ${src}`);
  if (!o.dryRun) fs.mkdirSync(OUT_DIR, { recursive: true });
  const slug = slugify(existing?.name ?? name);
  const file = await writeLogo(buf, ext, slug, o.dryRun);
  // Replacing an existing image: bump a version query so browsers/CDNs don't keep showing the old file.
  const logo = existing ? `${file}?v=${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}` : file;

  const aliases = [...new Set([...(existing?.aliases ?? []), ...o.aliases].filter((a) => a && norm(a) !== norm(name)))];
  const entry = { name: existing?.name ?? name, logo, aliases, ...(o.bg ? { bg: o.bg } : existing?.bg ? { bg: existing.bg } : {}), source: /^https?:/i.test(src) ? src : existing?.source ?? "local file" };
  const next = existing ? entries.map((e) => (e === existing ? entry : e)) : [...entries, entry];
  if (!o.dryRun) fs.writeFileSync(DATA, JSON.stringify(next, null, 2) + "\n");
  console.log(`${o.dryRun ? "[dry-run] would " : ""}${existing ? "update" : "add"} "${entry.name}" -> ${logo}${aliases.length ? ` (aliases: ${aliases.join(", ")})` : ""}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
