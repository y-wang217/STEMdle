import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set (32+ chars)");
    return "dev-insecure-secret-change-me";
  }
  return s;
}

/** Keyed hash for secrets stored at rest (session tokens, player tokens, IPs). */
export function hashToken(token: string): string {
  return createHmac("sha256", appSecret()).update(token).digest("hex");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const N = 16384,
  R = 8,
  P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: +n, r: +r, p: +p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}
