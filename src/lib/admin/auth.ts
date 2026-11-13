/**
 * Administrator authentication: email + scrypt password, server-side sessions
 * stored hashed in admin_sessions, httpOnly SameSite=Strict cookie.
 * Every admin page and admin API route calls requireAdmin*.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { HttpError, assertSameOrigin } from "@/lib/http";
import { hashToken, randomToken, verifyPassword, hashPassword } from "@/lib/security/crypto";

export const ADMIN_COOKIE = "mathdle_admin";
const SESSION_HOURS = 12;

export interface Admin {
  id: string;
  email: string;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires,
  };
}

export async function login(email: string, password: string): Promise<{ token: string; expires: Date } | null> {
  const [user] = await sql<{ id: string; password_hash: string; disabled: boolean }[]>`
    select id, password_hash, disabled from admin_users where lower(email) = lower(${email})`;
  // Always run a hash comparison to keep timing uniform.
  const ok = verifyPassword(password, user?.password_hash ?? hashPassword("timing-dummy"));
  if (!user || user.disabled || !ok) return null;
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await sql`insert into admin_sessions (admin_id, token_hash, expires_at) values (${user.id}, ${hashToken(token)}, ${expires})`;
  return { token, expires };
}

export async function setAdminCookie(token: string, expires: Date) {
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(expires));
}

async function adminFromToken(token: string | undefined): Promise<Admin | null> {
  if (!token) return null;
  const [row] = await sql<Admin[]>`
    select u.id, u.email from admin_sessions s join admin_users u on u.id = s.admin_id
    where s.token_hash = ${hashToken(token)} and s.revoked_at is null and s.expires_at > now() and not u.disabled`;
  return row ?? null;
}

/** For server components / layouts: redirect to the login page if not signed in. */
export async function requireAdminPage(): Promise<Admin> {
  const admin = await adminFromToken((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function currentAdmin(): Promise<Admin | null> {
  return adminFromToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** For admin API routes: 401 unless signed in; mutations must be same-origin. */
export async function requireAdmin(req: Request): Promise<Admin> {
  const admin = await adminFromToken((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) throw new HttpError(401, "administrator sign-in required", "unauthorized");
  assertSameOrigin(req);
  return admin;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await sql`update admin_sessions set revoked_at = now() where token_hash = ${hashToken(token)}`;
  jar.delete(ADMIN_COOKIE);
}
