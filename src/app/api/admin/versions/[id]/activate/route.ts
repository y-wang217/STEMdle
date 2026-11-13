import { json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { activateVersion } from "@/lib/factory/learning";

export const POST = adminRoute<{ id: string }>(async (_req, admin, { id }) => {
  await activateVersion(id, admin.id);
  return json({ ok: true });
});
