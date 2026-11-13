/**
 * Server-only Postgres client. Uses DATABASE_URL (Supabase: the pooled
 * connection string with the `postgres` role or a dedicated service role).
 */
if (typeof window !== "undefined") throw new Error("db module imported in the browser");
import postgres from "postgres";

declare global {
  var __mathdleSql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    prepare: false, // compatible with Supabase's transaction-mode pooler
    idle_timeout: 20,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
  });
}

export const sql: postgres.Sql = globalThis.__mathdleSql ?? (globalThis.__mathdleSql = create());
export type Tx = postgres.TransactionSql;
