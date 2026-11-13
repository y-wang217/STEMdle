import { assertSameOrigin, json, route } from "@/lib/http";
import { logout } from "@/lib/admin/auth";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  await logout();
  return json({ ok: true });
});
