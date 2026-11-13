/**
 * Create or reset an administrator.
 *   npx tsx scripts/create-admin.ts admin@example.com 'a long passphrase'
 */
import "dotenv/config";
import postgres from "postgres";
import { hashPassword } from "@/lib/security/crypto";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error("usage: create-admin.ts <email> <password>");
  if (password.length < 12) throw new Error("password must be at least 12 characters");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql`insert into admin_users (email, password_hash) values (${email.toLowerCase()}, ${hashPassword(password)})
            on conflict (email) do update set password_hash = excluded.password_hash, disabled = false`;
  await sql.end();
  console.log(`admin ${email} ready`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
