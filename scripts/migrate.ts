/**
 * Apply SQL migrations in supabase/migrations in filename order.
 *   npx tsx scripts/migrate.ts            # uses DATABASE_URL
 *   npx tsx scripts/migrate.ts --reset    # DROP SCHEMA public (local/test only)
 * Equivalent to `supabase db push` for hosted Supabase projects.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

export async function migrate(url: string, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production") throw new Error("refusing to reset in production");
      await sql.unsafe("drop schema if exists public cascade; create schema public;");
    }
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
    for (const f of files) {
      if (done.has(f)) continue;
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      if (!opts.quiet) console.log(`applied ${f}`);
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  migrate(url, { reset: process.argv.includes("--reset") }).then(
    () => console.log("migrations up to date"),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
