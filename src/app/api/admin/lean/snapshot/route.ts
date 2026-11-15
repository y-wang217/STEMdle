/**
 * Maintenance: copy the active Lean sandbox snapshot into a NON-EXPIRING
 * snapshot after re-running a smoke proof, and make it the active one.
 * Uses the app's own Vercel credentials (OIDC on Vercel). The VM has no
 * network and no credentials. Old snapshots are left in place.
 */
import { HttpError, json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentSnapshotId, sandboxRegion } from "@/lib/lean/runner";

export const maxDuration = 300;

export const POST = adminRoute(async (_req, admin) => {
  const from = await currentSnapshotId();
  if (!from) throw new HttpError(409, "no Lean snapshot configured");
  const { Sandbox } = await import("@vercel/sandbox");
  const sandbox = await Sandbox.create({
    region: sandboxRegion(),
    source: { type: "snapshot", snapshotId: from },
    networkPolicy: "deny-all",
    resources: { vcpus: 4 },
    timeout: 240_000,
    persistent: false,
    env: {},
  });
  try {
    await sandbox.writeFiles([{ path: "/tmp/Smoke.lean", content: "import Mathlib\ntheorem t (n : ℤ) : n^2 - (n - 1) * (n + 1) = 1 := by ring\n#print axioms t\n" }]);
    const res = await sandbox.runCommand({ cmd: "bash", args: ["-lc", "export PATH=/vercel/lean-toolchain/bin:$PATH; cd /vercel/lean && lake env lean --json /tmp/Smoke.lean && rm -f /tmp/Smoke.lean"] });
    const out = await res.stdout();
    if (res.exitCode !== 0 || !out.includes("'t' depends on axioms: [propext, Quot.sound]")) throw new HttpError(500, `smoke proof failed: ${out.slice(0, 300)}`);
    const snap = await sandbox.snapshot({ expiration: 0 });
    await sql`insert into app_settings (key, value, updated_by) values ('lean_sandbox_snapshot_id', ${sql.json(snap.snapshotId as never)}, ${admin.id})
              on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
    await audit(sql, admin.id, "lean_snapshot_refresh", "app_setting", "lean_sandbox_snapshot_id", { from, to: snap.snapshotId });
    return json({ from, to: snap.snapshotId, expiration: "never" });
  } catch (e) {
    await sandbox.stop().catch(() => {});
    throw e;
  }
});
