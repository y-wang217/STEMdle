/**
 * Initial definitions for the eight canonical slots and their v1 generator
 * profiles. These are only *seed* values: at runtime the source of truth is
 * bucket_profiles.config and generator_versions.profile in the database, which
 * the admin edits without migrations.
 */
import { z } from "zod";

export const GeneratorProfile = z.object({
  topic: z.string(),
  subtopics: z.array(z.string()),
  target_difficulty: z.number().min(1).max(10),
  difficulty_band: z.tuple([z.number(), z.number()]),
  target_solve_seconds: z.number().int().positive(),
  preferred: z.array(z.string()),
  forbidden: z.array(z.string()),
  techniques: z.array(z.string()),
  misconceptions: z.array(z.string()),
  examples: z.object({
    too_easy: z.array(z.string()),
    ideal: z.array(z.string()),
    too_hard: z.array(z.string()),
  }),
  editorial_instructions: z.array(z.string()),
  model: z.string().nullable(),
  procedural: z.object({
    difficulty: z.number(),
    template_weights: z.record(z.string(), z.number()),
  }),
});
export type GeneratorProfileT = z.infer<typeof GeneratorProfile>;

export const BucketConfig = z.object({
  difficulty_band: z.tuple([z.number(), z.number()]),
  calibration: z.object({
    min_fresh_reviews: z.number().int(),
    min_just_right_rate: z.number(),
    max_invalid_rate: z.number(),
  }),
});
export type BucketConfigT = z.infer<typeof BucketConfig>;

interface SlotSeed {
  slot: number;
  name: string;
  category: string;
  character: string;
  profile: Omit<GeneratorProfileT, "examples" | "model" | "procedural"> & { procedural_difficulty: number };
}

const common = {
  preferred: [
    "Original, self-contained problems with a single unambiguous answer",
    "A satisfying 'aha' that makes the answer feel inevitable once seen",
    "Clean numbers: answers are integers, simple fractions, or simple surds",
  ],
  forbidden: [
    "Difficulty created only by long or tedious calculation",
    "Ambiguous wording or answers that depend on unstated conventions",
    "Calculator-dependent decimals",
    "Problems copied or lightly reworded from published contests",
    "Answer choices that can be eliminated by size or parity alone without understanding",
  ],
};

export const SLOT_SEEDS: SlotSeed[] = [
  {
    slot: 1,
    name: "Arithmetic",
    category: "arithmetic",
    character: "Easy; mental math, numerical intuition",
    profile: {
      topic: "Arithmetic and number sense",
      subtopics: ["fractions", "percentages", "order of operations", "mental multiplication tricks", "averages", "rates", "powers and units digits"],
      target_difficulty: 2,
      difficulty_band: [1, 3.5],
      target_solve_seconds: 45,
      preferred: [...common.preferred, "Solvable mentally in under a minute", "Rewards a shortcut over brute force"],
      forbidden: [...common.forbidden, "Multi-step word problems with more than two operations"],
      techniques: ["common denominators", "difference of squares", "percent multipliers", "totals from averages", "cyclic units digits"],
      misconceptions: ["adding numerators and denominators", "adding successive percentages", "left-to-right errors", "dividing instead of multiplying rates"],
      editorial_instructions: ["Warm-up energy: players should feel smart, not tricked."],
      procedural_difficulty: 2,
    },
  },
  {
    slot: 2,
    name: "Algebra",
    category: "algebra",
    character: "Easy; equations, factoring, substitution",
    profile: {
      topic: "Elementary algebra",
      subtopics: ["linear equations", "factoring", "substitution", "systems of two equations", "exponent laws", "simple quadratics"],
      target_difficulty: 3,
      difficulty_band: [2, 4],
      target_solve_seconds: 60,
      preferred: [...common.preferred, "Factoring or substitution shortcut beats expansion"],
      forbidden: [...common.forbidden],
      techniques: ["factoring", "substitution", "difference of squares", "clearing denominators"],
      misconceptions: ["sign errors when distributing", "dividing by a variable that may be zero", "(a+b)^2 = a^2 + b^2", "extraneous roots"],
      editorial_instructions: [],
      procedural_difficulty: 3,
    },
  },
  {
    slot: 3,
    name: "Geometry I",
    category: "geometry_basic",
    character: "Easy; angles, lengths, area",
    profile: {
      topic: "Introductory geometry",
      subtopics: ["angle chasing", "Pythagorean theorem", "areas of triangles and composite shapes", "similar triangles", "circles"],
      target_difficulty: 3.5,
      difficulty_band: [2.5, 4.5],
      target_solve_seconds: 75,
      preferred: [...common.preferred, "A clear diagram that is accurate and labelled"],
      forbidden: [...common.forbidden, "Reading values off a diagram that are not stated"],
      techniques: ["angle sums", "Pythagoras", "area decomposition", "similarity ratios"],
      misconceptions: ["assuming a figure is to scale", "confusing radius and diameter", "using slant height as height", "area scales linearly"],
      editorial_instructions: [],
      procedural_difficulty: 3.5,
    },
  },
  {
    slot: 4,
    name: "Graphs",
    category: "graphs",
    character: "Medium; linear/quadratic functions",
    profile: {
      topic: "Linear and quadratic functions and their graphs",
      subtopics: ["slope and intercepts", "vertex form", "intersections", "transformations", "areas bounded by lines"],
      target_difficulty: 5,
      difficulty_band: [4, 6],
      target_solve_seconds: 90,
      preferred: [...common.preferred, "Graph-based reasoning that beats algebraic grinding"],
      forbidden: [...common.forbidden],
      techniques: ["completing the square", "symmetry of parabolas", "solving systems", "slope reasoning"],
      misconceptions: ["sign of horizontal shifts", "confusing x- and y-intercepts", "slope as run over rise", "vertex x = b/2a"],
      editorial_instructions: [],
      procedural_difficulty: 5,
    },
  },
  {
    slot: 5,
    name: "Trigonometry",
    category: "trigonometry",
    character: "Medium; ratios, identities, exact values",
    profile: {
      topic: "Trigonometry",
      subtopics: ["exact values", "Pythagorean identity", "sine and cosine laws", "trigonometric equations on an interval", "radian measure"],
      target_difficulty: 5.5,
      difficulty_band: [4.5, 6.5],
      target_solve_seconds: 100,
      preferred: [...common.preferred],
      forbidden: [...common.forbidden, "Answers requiring a calculator"],
      techniques: ["special triangles", "CAST rule", "identities", "double angle"],
      misconceptions: ["sin(a+b) = sin a + sin b", "missing solutions in other quadrants", "degree/radian confusion", "sign by quadrant"],
      editorial_instructions: [],
      procedural_difficulty: 5.5,
    },
  },
  {
    slot: 6,
    name: "Geometry II",
    category: "geometry_insight",
    character: "Hard; non-obvious geometric insight",
    profile: {
      topic: "Geometry requiring insight",
      subtopics: ["circle theorems", "tangent lengths", "similar triangles", "area ratios", "coordinate geometry", "power of a point"],
      target_difficulty: 6.8,
      difficulty_band: [6, 7.5],
      target_solve_seconds: 150,
      preferred: [...common.preferred, "An auxiliary line or a hidden similar triangle unlocks it"],
      forbidden: [...common.forbidden],
      techniques: ["inscribed angles", "equal tangents", "similarity", "power of a point", "area ratios"],
      misconceptions: ["assuming symmetry not given", "inscribed angle equals central angle", "area ratio equals length ratio"],
      editorial_instructions: [],
      procedural_difficulty: 6.8,
    },
  },
  {
    slot: 7,
    name: "Euclid-style I",
    category: "contest_1",
    character: "Very hard; competition reasoning",
    profile: {
      topic: "Contest mathematics in the spirit of the Euclid contest",
      subtopics: ["logarithms and exponents", "sequences", "number theory", "functional equations", "counting"],
      target_difficulty: 7.8,
      difficulty_band: [7, 8.5],
      target_solve_seconds: 240,
      preferred: [...common.preferred, "Several plausible approaches, one elegant"],
      forbidden: [...common.forbidden],
      techniques: ["substitution", "telescoping", "Vieta's formulas", "modular arithmetic", "symmetry"],
      misconceptions: ["missing domain restrictions on logs", "off-by-one counting", "assuming integer solutions"],
      editorial_instructions: [],
      procedural_difficulty: 7.8,
    },
  },
  {
    slot: 8,
    name: "Euclid-style II",
    category: "contest_2",
    character: "Extremely hard; hidden elegant trick",
    profile: {
      topic: "The day's boss problem: a hidden elegant trick",
      subtopics: ["clever factoring", "telescoping", "invariants", "symmetric functions", "functional equations", "number theory"],
      target_difficulty: 9.2,
      difficulty_band: [8.5, 10],
      target_solve_seconds: 420,
      preferred: [...common.preferred, "Nearly impossible until the key insight; then short"],
      forbidden: [...common.forbidden, "Brute-force enumeration as the intended path"],
      techniques: ["Sophie Germain identity", "telescoping products", "symmetric polynomials", "substitution symmetry"],
      misconceptions: ["applying a formula outside its hypotheses", "trusting a small-case pattern", "overlooking negative or non-integer solutions"],
      editorial_instructions: [],
      procedural_difficulty: 9.2,
    },
  },
];

export function defaultConfig(seed: SlotSeed): BucketConfigT {
  return {
    difficulty_band: seed.profile.difficulty_band,
    calibration: { min_fresh_reviews: 10, min_just_right_rate: 0.6, max_invalid_rate: 0.1 },
  };
}

export function defaultProfile(seed: SlotSeed): GeneratorProfileT {
  const { procedural_difficulty, ...rest } = seed.profile;
  return {
    ...rest,
    examples: { too_easy: [], ideal: [], too_hard: [] },
    model: null,
    procedural: { difficulty: procedural_difficulty, template_weights: {} },
  };
}
