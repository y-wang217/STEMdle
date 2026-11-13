import { route } from "@/lib/http";
import { requireAdmin, type Admin } from "./auth";

/** Admin route wrapper: authentication + same-origin enforcement on every call. */
export function adminRoute<P>(fn: (req: Request, admin: Admin, params: P) => Promise<Response>) {
  return route(async (req: Request, ctx: { params: Promise<P> }) => {
    const admin = await requireAdmin(req);
    return fn(req, admin, await ctx.params);
  });
}
