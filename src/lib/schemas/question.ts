/**
 * The candidate-question contract shared by every generator (AI or procedural),
 * the validation pipeline (TS + Python/SymPy), the admin UI and the player game.
 *
 * Text fields use TeX inside `$...$` (inline) or `$$...$$` (display) delimiters.
 * `value`, `verification.expression`, `checks` and `derivation` are SymPy
 * expressions in a restricted grammar (see validator/mathdle_validator.py).
 */
import { z } from "zod";

const Id = z.string().describe("Short identifier, e.g. 'A' or 'O'");

export const DiagramPoint = z.object({
  kind: z.literal("point"),
  id: Id,
  x: z.number(),
  y: z.number(),
  label: z.string().nullable().describe("Label drawn next to the point, or null to use the id"),
  show: z.boolean().describe("Whether to draw the point marker"),
});
export const DiagramSegment = z.object({
  kind: z.literal("segment"),
  from: Id,
  to: Id,
  label: z.string().nullable().describe("Text/TeX drawn at the midpoint, e.g. '5' or 'x'"),
  length: z.number().nullable().describe("Numeric length this segment represents (checked when to_scale)"),
  dashed: z.boolean(),
  ticks: z.number().int().describe("Congruence tick marks, 0-3"),
  arrows: z.number().int().describe("Parallel marks (chevrons), 0-2"),
});
export const DiagramLine = z.object({
  kind: z.literal("line"),
  through: z.array(Id).length(2),
  dashed: z.boolean(),
});
export const DiagramPolygon = z.object({
  kind: z.literal("polygon"),
  vertices: z.array(Id),
  shaded: z.boolean(),
});
export const DiagramCircle = z.object({
  kind: z.literal("circle"),
  center: Id,
  radius: z.number().nullable(),
  through: Id.nullable(),
  points_on: z.array(Id).describe("Points claimed to lie on this circle (checked)"),
});
export const DiagramArc = z.object({
  kind: z.literal("arc"),
  center: Id,
  from: Id,
  to: Id,
});
export const DiagramAngle = z.object({
  kind: z.literal("angle"),
  a: Id,
  vertex: Id,
  b: Id,
  label: z.string().nullable(),
  right: z.boolean().describe("Draw a right-angle square marker"),
  measure_deg: z.number().nullable().describe("Angle this marking represents (checked when to_scale)"),
});
export const DiagramFunction = z.object({
  kind: z.literal("function"),
  expr: z.string().describe("Expression in x using + - * / ^ ( ) and sin cos tan sqrt abs exp ln log"),
  x_min: z.number(),
  x_max: z.number(),
  label: z.string().nullable(),
});
export const DiagramText = z.object({
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  text: z.string(),
});

export const DiagramElement = z.discriminatedUnion("kind", [
  DiagramPoint,
  DiagramSegment,
  DiagramLine,
  DiagramPolygon,
  DiagramCircle,
  DiagramArc,
  DiagramAngle,
  DiagramFunction,
  DiagramText,
]);

export const DiagramSpec = z.object({
  type: z.enum(["geometry", "graph"]),
  x_min: z.number(),
  x_max: z.number(),
  y_min: z.number(),
  y_max: z.number(),
  axes: z.boolean(),
  grid: z.boolean(),
  to_scale: z.boolean().describe("True if coordinates are an accurate construction of the described figure"),
  essential: z.boolean().describe("True if the question cannot be solved from the text alone"),
  alt_text: z.string().describe("Complete textual description for screen readers"),
  elements: z.array(DiagramElement),
});

export const OptionSpec = z.object({
  tex: z.string().describe("Answer as shown to players, TeX inside $...$"),
  value: z
    .string()
    .describe("SymPy expression for the exact value of this option, e.g. 'Rational(7,2)' or '2*sqrt(3)'. Empty only for manual verification."),
  is_correct: z.boolean(),
  misconception: z
    .string()
    .describe("For a distractor: the specific mistake that produces it. For the correct option: empty string."),
  rationale: z
    .string()
    .describe("Why this option is tempting (distractor) or why it is right (correct option)"),
  derivation: z
    .string()
    .nullable()
    .describe("For a distractor: SymPy expression that reproduces this value by following the mistaken path. Null for the correct option."),
});

export const VerificationSpec = z.object({
  kind: z.enum(["sympy", "manual"]),
  expression: z
    .string()
    .describe("SymPy expression that independently computes the correct answer from first principles (not just restating it)"),
  checks: z
    .array(z.string())
    .describe("Extra SymPy boolean expressions that must all be True, e.g. domain or uniqueness checks"),
  precision_dp: z
    .number()
    .int()
    .nullable()
    .describe("If answers are rounded decimals, the number of decimal places; otherwise null"),
  notes: z.string(),
});

export const CandidateQuestion = z.object({
  statement: z.string(),
  options: z.array(OptionSpec).length(4),
  solution: z.string().describe("Complete worked solution"),
  key_insight: z.string().describe("One or two sentences: the idea that unlocks the problem"),
  tags: z.array(z.string()),
  techniques: z.array(z.string()),
  estimated_difficulty: z.number().describe("1 (trivial) to 10 (hardest Euclid problem)"),
  estimated_solve_seconds: z.number().int(),
  verification: VerificationSpec,
  diagram: DiagramSpec.nullable(),
  template_id: z.string().nullable().describe("Procedural template id, or null for AI-authored questions"),
});

export type DiagramSpecT = z.infer<typeof DiagramSpec>;
export type DiagramElementT = z.infer<typeof DiagramElement>;
export type OptionSpecT = z.infer<typeof OptionSpec>;
export type CandidateQuestionT = z.infer<typeof CandidateQuestion>;

export const CandidateBatch = z.object({
  questions: z.array(CandidateQuestion),
});

/**
 * Wire format for AI generation. Structured outputs compile the schema into a
 * grammar, and the nine-way diagram union makes it too large, so the diagram
 * travels as a JSON string (format described in the prompt) and is validated
 * against DiagramSpec after parsing.
 */
export const WireCandidate = CandidateQuestion.omit({ diagram: true }).extend({
  diagram_json: z
    .string()
    .nullable()
    .describe("null, or a JSON-encoded diagram object exactly matching the diagram format in the instructions"),
});
export const WireBatch = z.object({ questions: z.array(WireCandidate) });
export type WireCandidateT = z.infer<typeof WireCandidate>;

/** Convert a wire candidate to the candidate contract. An unparseable diagram is kept as-is so schema validation rejects it with a reason. */
export function fromWire(w: WireCandidateT): unknown {
  const { diagram_json, ...rest } = w;
  let diagram: unknown = null;
  if (diagram_json && diagram_json.trim() && diagram_json.trim() !== "null") {
    try {
      diagram = JSON.parse(diagram_json);
    } catch {
      diagram = { invalid_json: diagram_json.slice(0, 200) };
    }
  }
  return { ...rest, diagram };
}
