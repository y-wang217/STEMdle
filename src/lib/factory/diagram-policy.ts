/** Diagram policy learned from editor notes. Pure: no database access. */
import type { DiagramPolicyT } from "@/lib/buckets/defaults";

const DIAGRAM_NOTE = /\b(diagrams?|figures?|pictures?|sketch|drawing|draw)\b/i;
const DIAGRAM_ORDER: DiagramPolicyT[] = ["when_helpful", "preferred", "required"];

/**
 * Two or more notes asking for a diagram move the policy up one step; a note
 * that says diagrams are mandatory ("must have a diagram", "they all need one")
 * moves it straight to required. Never lowers the policy.
 */
export function learnDiagramPolicy(current: DiagramPolicyT, notes: (string | null)[]): { to: DiagramPolicyT; mentions: number } | null {
  const asks = notes.filter((n): n is string => Boolean(n && DIAGRAM_NOTE.test(n)));
  if (!asks.length) return null;
  const emphatic = asks.some((n) => /\b(must|always|every|all)\b/i.test(n));
  if (!emphatic && asks.length < 2) return null;
  const i = DIAGRAM_ORDER.indexOf(current);
  const to = emphatic ? "required" : DIAGRAM_ORDER[Math.min(i + 1, DIAGRAM_ORDER.length - 1)];
  return DIAGRAM_ORDER.indexOf(to) > i ? { to, mentions: asks.length } : null;
}
