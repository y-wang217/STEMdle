import { sql } from "@/lib/db";
import { Card, td, th } from "@/components/admin/ui";

export default async function AuditPage() {
  const [log, alerts, corrections] = await Promise.all([
    sql<{ id: string; created_at: Date; email: string | null; action: string; entity_type: string; entity_id: string | null; details: unknown }[]>`
      select l.id::text, l.created_at, a.email, l.action, l.entity_type, l.entity_id, l.details
      from audit_log l left join admin_users a on a.id = l.admin_id order by l.id desc limit 300`,
    sql<{ id: string; kind: string; message: string; created_at: Date; resolved_at: Date | null }[]>`
      select id, kind, message, created_at, resolved_at from admin_alerts order by created_at desc limit 50`,
    sql<{ id: string; run_id: string; delta: number; reason: string; created_at: Date; email: string }[]>`
      select c.id, c.run_id, c.delta, c.reason, c.created_at, a.email from score_corrections c join admin_users a on a.id = c.admin_id order by c.created_at desc limit 100`,
  ]);
  return (
    <div>
      <Card title="Alerts">
        <ul>
          {alerts.map((a) => (
            <li key={a.id} className={a.resolved_at ? "text-neutral-500" : "text-red-700"}>
              {a.created_at.toISOString().slice(0, 16)} <b>{a.kind}</b> {a.message} {a.resolved_at && "(resolved)"}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Score corrections">
        <ul>
          {corrections.map((c) => (
            <li key={c.id}>
              {c.created_at.toISOString().slice(0, 16)} run {c.run_id.slice(0, 8)} {c.delta > 0 ? `+${c.delta}` : c.delta} by {c.email}: {c.reason}
            </li>
          ))}
          {!corrections.length && <li className="text-neutral-500">none</li>}
        </ul>
      </Card>
      <Card title="Audit log (append-only)">
        <table className="w-full border-collapse" data-testid="audit">
          <thead>
            <tr>
              {["When", "Who", "Action", "Entity", "Details"].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td className={td}>{l.created_at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className={td}>{l.email ?? "system"}</td>
                <td className={td}>{l.action}</td>
                <td className={td}>
                  {l.entity_type} {l.entity_id?.slice(0, 8)}
                </td>
                <td className={`${td} font-mono text-[11px]`}>{JSON.stringify(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
