import { after } from "next/server";
import { json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { getActivity } from "@/lib/factory/activity";
import { processLeanQueue } from "@/lib/lean/pipeline";

export const maxDuration = 300;

export const GET = adminRoute(async () => {
  const activity = await getActivity();
  // Keep formal verification moving while an admin has the factory open: if
  // checks are waiting and no worker is busy, start one after responding.
  if (activity.lean.pending > 0 && activity.lean.checking === 0 && activity.lean.runner)
    after(() => processLeanQueue({ maxJobs: 3, deadlineMs: 240_000 }).catch((e) => console.error("[mathdle] lean queue", e)));
  return json(activity);
});
