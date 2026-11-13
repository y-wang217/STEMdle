import { sql, type Tx } from "@/lib/db";

type Db = typeof sql | Tx;

export async function audit(
  db: Db,
  adminId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  await db`insert into audit_log (admin_id, action, entity_type, entity_id, details)
           values (${adminId}, ${action}, ${entityType}, ${entityId}, ${sql.json(details as never)})`;
}

/**
 * Raise an operator alert (deduplicated by key while unresolved). Optionally
 * forwarded to ALERT_WEBHOOK_URL. Never throws.
 */
export async function raiseAlert(kind: string, message: string, details: Record<string, unknown> = {}, dedupeKey?: string) {
  try {
    const key = dedupeKey ?? `${kind}:${message}`;
    const rows = await sql`
      insert into admin_alerts (kind, dedupe_key, message, details) values (${kind}, ${key}, ${message}, ${sql.json(details as never)})
      on conflict (dedupe_key) do nothing returning id`;
    if (rows.length) console.error(`[mathdle alert] ${kind}: ${message}`);
    if (rows.length && process.env.ALERT_WEBHOOK_URL) {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Mathdle ${kind}: ${message}` }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[mathdle] failed to record alert", e);
  }
}

export async function resolveAlert(dedupeKey: string) {
  await sql`update admin_alerts set resolved_at = now(), dedupe_key = dedupe_key || ':resolved:' || id
            where dedupe_key = ${dedupeKey} and resolved_at is null`;
}
