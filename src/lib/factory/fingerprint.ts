/**
 * Duplicate / near-duplicate detection.
 *  - exactKey: normalized statement including numbers → identical question.
 *  - skeleton: statement with numbers and single-letter variables abstracted →
 *    "same mathematical structure, different numbers".
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\(dfrac|tfrac)/g, "\\frac")
    .replace(/\\(left|right|,|;|!|quad|qquad)/g, " ")
    .replace(/[{}$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identity of a question: statement plus its (unordered) answer options. */
export function exactKey(statement: string, optionTex: string[] = []): string {
  return [normalize(statement), ...optionTex.map(normalize).sort()].join(" || ");
}

export function skeleton(statement: string): string {
  return normalize(statement)
    .replace(/\d+(\.\d+)?/g, "#")
    .replace(/\b[a-z]\b/g, "v")
    .replace(/#(\s*#)+/g, "#");
}

function shingles(s: string, k = 3): Set<string> {
  const words = s.split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < k) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + k <= words.length; i++) out.add(words.slice(i, i + k).join(" "));
  return out;
}

export function jaccard(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function structuralSimilarity(a: string, b: string): number {
  return jaccard(skeleton(a), skeleton(b));
}

export const NEAR_DUPLICATE_THRESHOLD = 0.8;
