import "server-only";
import postgres from "postgres";
import { databaseConfigured } from "../env";

export type Sql = postgres.Sql;
export type TxSql = postgres.TransactionSql;

declare global {
  var __campgradeSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL!;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, {
    ssl: local ? false : "require",
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: {
      // Return dates as 'YYYY-MM-DD' strings and timestamps as ISO strings (what the UI expects).
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      timestamptz: {
        to: 1184, from: [1114, 1184],
        serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x),
        parse: (x: string) => new Date(/([+-]\d\d(:?\d\d)?|Z)$/.test(x) ? x : `${x}Z`).toISOString(),
      },
    },
  });
}

/** Shared connection pool, or null when DATABASE_URL is not set (preview mode). */
export function getSql(): postgres.Sql | null {
  if (!databaseConfigured()) return null;
  if (!globalThis.__campgradeSql) globalThis.__campgradeSql = create();
  return globalThis.__campgradeSql;
}

/** Like getSql() but throws — for code paths that already checked configuration. */
export function requireSql(): postgres.Sql {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured");
  return sql;
}

/** Runs fn in a transaction with app.user_id set (required to write community review content). */
export async function asUser<T>(userId: string, fn: (tx: TxSql) => Promise<T>): Promise<T> {
  return requireSql().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}
