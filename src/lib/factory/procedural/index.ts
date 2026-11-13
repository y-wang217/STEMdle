import type { CandidateQuestionT } from "@/lib/schemas/question";
import { Rng } from "./rng";
import { type ProceduralTemplate, RetryTemplate } from "./types";
import { bucket1Templates } from "./bucket1";
import { bucket2Templates } from "./bucket2";
import { bucket3Templates } from "./bucket3";
import { bucket4Templates } from "./bucket4";
import { bucket5Templates } from "./bucket5";
import { bucket6Templates } from "./bucket6";
import { bucket7Templates } from "./bucket7";
import { bucket8Templates } from "./bucket8";

export const templatesBySlot: Record<number, ProceduralTemplate[]> = {
  1: bucket1Templates,
  2: bucket2Templates,
  3: bucket3Templates,
  4: bucket4Templates,
  5: bucket5Templates,
  6: bucket6Templates,
  7: bucket7Templates,
  8: bucket8Templates,
};

export function allTemplates(): ProceduralTemplate[] {
  return Object.values(templatesBySlot).flat();
}

export interface ProceduralKnobs {
  /** Target difficulty on the global 1–10 scale. */
  difficulty: number;
  /** Template id → sampling weight. Missing ids default to 1; 0 disables a template. */
  template_weights: Record<string, number>;
}

export interface ProceduralOutput {
  candidate: CandidateQuestionT;
  template_id: string;
  difficulty: number;
}

/**
 * Generate `count` candidates for a slot. Templates are sampled by weight, with a
 * diversity rule: no template is used twice in a row while others are available.
 */
export function generateProcedural(slot: number, count: number, knobs: ProceduralKnobs, seed: number): ProceduralOutput[] {
  const templates = templatesBySlot[slot] ?? [];
  if (!templates.length) throw new Error(`no procedural templates for slot ${slot}`);
  const rng = new Rng(seed);
  const out: ProceduralOutput[] = [];
  let last: string | null = null;
  for (let n = 0; n < count; n++) {
    let produced: ProceduralOutput | null = null;
    for (let attempt = 0; attempt < 40 && !produced; attempt++) {
      const eligible = templates.filter((t) => (knobs.template_weights[t.id] ?? 1) > 0);
      const pool = eligible.length > 1 ? eligible.filter((t) => t.id !== last) : eligible;
      if (!pool.length) throw new Error(`all templates disabled for slot ${slot}`);
      const weights = pool.map((t) => {
        const w = knobs.template_weights[t.id] ?? 1;
        // prefer templates whose range covers the requested difficulty
        const [lo, hi] = t.range;
        const fit = knobs.difficulty < lo ? 1 / (1 + lo - knobs.difficulty) : knobs.difficulty > hi ? 1 / (1 + knobs.difficulty - hi) : 1;
        return w * fit;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng.next() * total;
      let tpl = pool[pool.length - 1];
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          tpl = pool[i];
          break;
        }
      }
      // jitter difficulty slightly so a batch is not uniform
      const d = Math.max(1, Math.min(10, knobs.difficulty + (rng.next() - 0.5) * 0.8));
      try {
        const candidate = tpl.generate(new Rng(Math.floor(rng.next() * 2 ** 32)), d);
        produced = { candidate: { ...candidate, template_id: tpl.id }, template_id: tpl.id, difficulty: d };
        last = tpl.id;
      } catch (e) {
        if (!(e instanceof RetryTemplate)) throw e;
      }
    }
    if (!produced) throw new Error(`could not produce a candidate for slot ${slot}`);
    out.push(produced);
  }
  return out;
}
