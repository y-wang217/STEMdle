import Link from "next/link";
import { reserveStatus } from "@/lib/composer";
import { addDays } from "@/lib/time";
import { Card, StatusChip, td, th } from "@/components/admin/ui";

export default async function ComposerIndex() {
  const r = await reserveStatus();
  const days = Array.from({ length: 21 }, (_, i) => addDays(r.today, i));
  return (
    <div>
      <Card title={`Approved bank (unused questions per slot)`}>
        <div className="flex flex-wrap gap-3">
          {Object.entries(r.bank).map(([slot, n]) => (
            <span key={slot} className={n === 0 ? "text-red-600" : ""}>
              slot {slot}: <b>{n}</b>
            </span>
          ))}
        </div>
      </Card>
      <Card title={`Upcoming days (Toronto) — ${r.consecutiveReadyDays} consecutive approved, target ${r.target}`}>
        <table className="w-full border-collapse" data-testid="composer-days">
          <thead>
            <tr>
              {["Date", "No.", "Status", "Questions", ""].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const c = r.upcoming.find((u) => u.challenge_date === d);
              return (
                <tr key={d}>
                  <td className={td}>
                    {d} {d === r.today && <b>(today)</b>}
                  </td>
                  <td className={td}>{c?.challenge_number ?? "—"}</td>
                  <td className={td}>{c ? <StatusChip status={c.status} /> : <span className="text-red-600">empty</span>}</td>
                  <td className={td}>{c ? `${c.n}/8` : "—"}</td>
                  <td className={td}>
                    <Link className="underline" href={`/admin/composer/${d}`}>
                      {c ? "Open" : "Compose"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
