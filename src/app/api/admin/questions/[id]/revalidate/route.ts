import { HttpError, json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { sql } from "@/lib/db";
import { validateVersions } from "@/lib/factory/validate";
import { getProvider, defaultProviderId } from "@/lib/factory/providers";
import { audit } from "@/lib/audit";
import { after } from "next/server";
import { enqueueLean, processLeanQueue } from "@/lib/lean/pipeline";

export const maxDuration = 120;

export const POST = adminRoute<{ id: string }>(async (_req, admin, { id }) => {
  const [q] = await sql<{ current_version_id: string }[]>`select current_version_id from questions where id = ${id}`;
  if (!q) throw new HttpError(404, "question not found");
  const [out] = await validateVersions([q.current_version_id], getProvider(defaultProviderId()));
  await audit(sql, admin.id, "revalidate_question", "question", id, { status: out?.status });
  if (out && out.status !== "failed") {
    await enqueueLean([q.current_version_id], admin.id);
    after(() => processLeanQueue().catch(() => {}));
  }
  return json(out);
});
