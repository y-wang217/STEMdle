import Link from "next/link";
import { sql } from "@/lib/db";
import { bucketOverview } from "@/lib/factory/metrics";
import { reserveStatus } from "@/lib/composer";
import { availableProviders } from "@/lib/factory/providers";
import { Card, StatusChip, td, th } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/kit";

export default async function Dashboard() {
  const [buckets, reserve, alerts] = await Promise.all([
    bucketOverview(),
    reserveStatus(),
    sql<{ id: string; kind: string; message: string; created_at: Date }[]>`
      select id, kind, message, created_at from admin_alerts where resolved_at is null order by created_at desc limit 20`,
  ]);
  const providers = availableProviders();
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");
  return (
    <div>
      {alerts.length > 0 && (
        <Card title={`Alerts (${alerts.length})`}>
          <ul className="space-y-1" data-testid="alerts">
            {alerts.map((a) => (
              <li key={a.id} className="text-red-700 dark:text-red-400">
                <b>{a.kind}</b> · {a.message} <span className="text-neutral-500">({a.created_at.toISOString().slice(0, 16)})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title="Buckets"
        actions={
          <span className="text-neutral-500">
            Generators:{" "}
            {providers.map((p) => (
              <span key={p.id} className="ml-2">
                {p.id} {p.available ? "✓" : `✗ (${p.reason})`}
                {p.devAdapter ? " · dev adapter" : ""}
              </span>
            ))}
          </span>
        }
      >
        <table className="w-full border-collapse" data-testid="bucket-table">
          <thead>
            <tr>
              {["Slot", "Bucket", "Generator", "Bank (unused approved)", "To review", "Needs math review", "Reviewed", "Too easy", "Just right", "Too hard", "Invalid", ""].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.slot}>
                <td className={td}>{b.slot}</td>
                <td className={td}>
                  <Link className="font-medium underline" href={`/admin/buckets/${b.slot}`}>
                    {b.name}
                  </Link>
                  <div className="text-neutral-500">{b.character}</div>
                </td>
                <td className={td}>
                  v{b.active_version} {b.active_status && <StatusChip status={b.active_status} />}
                </td>
                <td className={td}>{reserve.bank[b.slot]}</td>
                <td className={td}>{b.ready}</td>
                <td className={td}>{b.needs_review}</td>
                <td className={td}>{b.reviewed}</td>
                <td className={td}>{pct(b.too_easy, b.reviewed)}</td>
                <td className={td}>{pct(b.just_right, b.reviewed)}</td>
                <td className={td}>{pct(b.too_hard, b.reviewed)}</td>
                <td className={td}>{b.invalid}</td>
                <td className={td}>
                  <Link className="underline" href={`/admin/review?slot=${b.slot}`}>
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card
        title={`Schedule reserve: ${reserve.consecutiveReadyDays} consecutive day(s) approved (target ${reserve.target})`}
        actions={<ActionButton url="/api/admin/cron-run">Run daily job now</ActionButton>}
      >
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 14 }, (_, i) => {
            const d = new Date(Date.parse(reserve.today + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
            const c = reserve.upcoming.find((u) => u.challenge_date === d);
            return (
              <Link key={d} href={`/admin/composer/${d}`} className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                <div className="font-mono">{d.slice(5)}</div>
                {c ? <StatusChip status={c.status} /> : <span className="text-red-600">missing</span>}
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
