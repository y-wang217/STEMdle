import { json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { markCalibrated } from "@/lib/factory/metrics";

export const POST = adminRoute<{ id: string }>(async (_req, admin, { id }) => json(await markCalibrated(id, admin.id)));
