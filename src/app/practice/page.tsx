import type { Metadata } from "next";
import { Practice } from "@/components/practice/Practice";
import { todayChallenge } from "@/lib/game/challenge";
import { currentPlayer } from "@/lib/game/identity";
import { defaultPracticeSlot, practiceTopics } from "@/lib/game/practice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Practice · Mathdle",
  description: "Unlimited, unranked practice from the vetted question bank.",
};

export default async function PracticePage() {
  const [t, player, topics] = await Promise.all([todayChallenge(), currentPlayer(), practiceTopics()]);
  const defaultSlot = await defaultPracticeSlot(player?.id ?? null, t.challenge?.id ?? null);
  return <Practice topics={topics} defaultSlot={defaultSlot} />;
}
