import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { hashToken } from "@/lib/security/crypto";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: number | ResponseInit) {
  const res = NextResponse.json(data, typeof init === "number" ? { status: init } : init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Wrap a route handler: maps HttpError/ZodError to JSON, hides internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof ZodError) return json({ error: "invalid request", issues: e.issues.slice(0, 5) }, 400);
      if (e instanceof Response) return e;
      console.error("[mathdle] unhandled route error", e);
      return json({ error: "internal error" }, 500);
    }
  };
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** Non-reversible IP key for rate limiting (raw IPs are never stored). */
export function ipKey(req: Request): string {
  return hashToken(`ip:${clientIp(req)}`).slice(0, 32);
}

/** CSRF defence for cookie-authenticated mutations: require a same-origin request. */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "cross-origin request rejected", "csrf");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "cross-origin request rejected", "csrf");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "cross-origin request rejected", "csrf");
  }
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "request too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}
