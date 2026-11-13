/**
 * Anonymous player identity (best-effort; no accounts).
 * The browser holds a random secret in an httpOnly cookie; the database stores
 * only its keyed hash. The public player id and nickname are not credentials.
 * Clearing cookies or switching devices creates a new identity — by design.
 */
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { hashToken, randomToken } from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/ratelimit";

export const PLAYER_COOKIE = "mathdle_pid";

export interface Player {
  id: string;
  nickname: string;
}

const ADJ = ["Swift", "Clever", "Quiet", "Bold", "Lucid", "Sharp", "Nimble", "Prime", "Rational", "Curious", "Steady", "Bright", "Keen", "Witty", "Calm", "Brave"];
const NOUN = ["Tangent", "Vertex", "Radian", "Lemma", "Axiom", "Vector", "Cosine", "Integer", "Theorem", "Parabola", "Fraction", "Matrix", "Sigma", "Prism", "Chord", "Ratio"];

export function randomNickname(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return `${ADJ[r(ADJ.length)]}${NOUN[r(NOUN.length)]}${10 + r(90)}`;
}

const BLOCKED = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|bitch|whore|slut|dick|pussy|cock)/i;

export function validateNickname(raw: string): string {
  const n = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (n.length < 3 || n.length > 20) throw new HttpError(400, "nickname must be 3–20 characters");
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) throw new HttpError(400, "letters, numbers, spaces, _ . - only");
  if (BLOCKED.test(n.replace(/[\s_.-]/g, ""))) throw new HttpError(400, "please choose a different nickname");
  return n;
}

export async function currentPlayer(): Promise<Player | null> {
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [p] = await sql<Player[]>`
    update anonymous_players set last_seen_at = now() where token_hash = ${hashToken(token)} returning id, nickname`;
  return p ?? null;
}

export async function getOrCreatePlayer(ipKey: string): Promise<Player> {
  const existing = await currentPlayer();
  if (existing) return existing;
  await enforceRateLimit(`newplayer:${ipKey}`, 30, 3600);
  const token = randomToken();
  const [p] = await sql<Player[]>`
    insert into anonymous_players (token_hash, nickname) values (${hashToken(token)}, ${randomNickname()}) returning id, nickname`;
  (await cookies()).set(PLAYER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return p;
}

export async function setNickname(playerId: string, raw: string): Promise<string> {
  const n = validateNickname(raw);
  await sql`update anonymous_players set nickname = ${n} where id = ${playerId}`;
  return n;
}
