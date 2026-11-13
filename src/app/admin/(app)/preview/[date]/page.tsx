import { notFound } from "next/navigation";
import { getChallengeByDate } from "@/lib/composer";
import { loadVersions } from "@/lib/factory/store";
import { PreviewPlayer } from "@/components/admin/PreviewPlayer";

export default async function Preview({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const c = await getChallengeByDate(date);
  if (!c) notFound();
  const qs = await loadVersions(c.slots.map((s) => s.version_id));
  return (
    <PreviewPlayer
      number={c.challenge_number}
      date={date}
      questions={qs.map((q, i) => ({
        slot: c.slots[i].slot,
        statement: q.statement,
        diagram: q.diagram,
        options: q.options.map((o) => ({ id: o.id, label: o.label, tex: o.tex })),
        correctId: q.options.find((o) => o.is_correct)!.id,
      }))}
    />
  );
}
