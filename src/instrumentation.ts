/**
 * Observability hook: every unhandled server error is logged as one JSON line
 * (picked up by Vercel/any log drain) and optionally forwarded to
 * ERROR_WEBHOOK_URL (e.g. a Slack/Sentry-compatible endpoint).
 * No request bodies, cookies or IPs are included.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as Error & { digest?: string };
  const record = {
    level: "error",
    msg: e.message,
    digest: e.digest,
    path: request.path,
    method: request.method,
    route: context.routePath,
    kind: context.routeType,
    at: new Date().toISOString(),
  };
  console.error(JSON.stringify(record));
  if (process.env.ERROR_WEBHOOK_URL) {
    await fetch(process.env.ERROR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Mathdle error ${record.method} ${record.path}: ${record.msg}`, ...record }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }
};
