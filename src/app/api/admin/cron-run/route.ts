import { json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { dailyJob } from "@/lib/composer";

/** Lets an admin run the scheduled job manually (e.g. after approving today's set late). */
export const POST = adminRoute(async () => json(await dailyJob()));
