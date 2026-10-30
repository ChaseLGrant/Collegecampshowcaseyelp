// Shared helpers for the data import scripts (camps, reviews, editorial).
import { readFileSync } from "node:fs";
import postgres from "postgres";

/** Parses `[--dry-run] file.json ...` style argv. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const files = argv.filter((a) => !a.startsWith("--"));
  return { dryRun: flags.has("--dry-run"), verbose: flags.has("--verbose"), files, flags };
}

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, { ssl: local ? false : "require", max: 1, onnotice: () => {} });
}

export function readJsonArray(file) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
  if (!rows) throw new Error(`${file}: expected a JSON array (or {"items": [...]})`);
  return rows;
}

const ROLLBACK = Symbol("dry-run rollback");

/** Runs fn(tx) in one transaction. With dryRun the transaction is rolled back after fn finishes. */
export async function inTransaction(sql, dryRun, fn) {
  let result;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return result;
}

export const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Loose name key: case, accents, punctuation, "&"/"and" and extra spaces ignored. */
export const nameKey = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/&/g, " and ").replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const isoDate = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

/** Postgres `date` values come back as Date objects; compare as YYYY-MM-DD. */
export const dateStr = (d) => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** First non-empty value among keys (lets data files use a few reasonable field names). */
export const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

export const truthy = (v) => v === true || v === 1 || (typeof v === "string" && /^(true|yes|y|1)$/i.test(v.trim()));

/** Editorial score 1.0–5.0 rounded to one decimal, or null (matches camps.editorial_score numeric(2,1)). */
export function normalizeScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  return r >= 1 && r <= 5 ? r : null;
}
