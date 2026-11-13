/**
 * DEVELOPMENT ADAPTER — not AI generation.
 * Produces questions from hand-written parametrized templates so the full
 * factory loop (generate → validate → review → learn → regenerate) can run
 * without external credentials. Its "learning" is a deterministic update of
 * difficulty and per-template weights (see learning.ts).
 */
import { generateProcedural } from "@/lib/factory/procedural";
import type { GenerationRequest, GeneratorProvider } from "./types";

export const proceduralProvider: GeneratorProvider = {
  id: "procedural",
  model: "procedural-templates-v1",
  devAdapter: true,
  async generate(req: GenerationRequest) {
    const out = generateProcedural(req.slot, req.count, req.profile.procedural, req.seed);
    return {
      items: out.map((o) => ({
        candidate: o.candidate,
        meta: { template_id: o.template_id, requested_difficulty: o.difficulty, adapter: "procedural (development)" },
      })),
    };
  },
};
