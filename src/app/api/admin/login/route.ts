import { z } from "zod";
import { HttpError, assertSameOrigin, ipKey, json, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { login, setAdminCookie } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { sql } from "@/lib/db";

const Body = z.object({ email: z.string().max(200), password: z.string().max(500) });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  await enforceRateLimit(`login:${ipKey(req)}`, 10, 900);
  const body = Body.parse(await readJson(req));
  const session = await login(body.email, body.password);
  if (!session) throw new HttpError(401, "invalid email or password", "bad_credentials");
  await setAdminCookie(session.token, session.expires);
  await audit(sql, null, "admin_login", "admin_user", body.email.toLowerCase());
  return json({ ok: true });
});
