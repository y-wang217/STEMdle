import type { CandidateQuestionT } from "@/lib/schemas/question";
import type { GeneratorProfileT } from "@/lib/buckets/defaults";

export interface ExampleQuestion {
  id: string;
  statement: string;
  options: { tex: string; is_correct: boolean }[];
  key_insight: string;
  judgment: "too_easy" | "just_right" | "too_hard" | "invalid";
  note: string | null;
  techniques: string[];
}

export interface GenerationRequest {
  slot: number;
  slotName: string;
  character: string;
  profile: GeneratorProfileT;
  count: number;
  seed: number;
  examples: ExampleQuestion[];
  /** Recent statements in this bucket, used to enforce diversity. */
  recentStatements: string[];
  /** Technique frequency among recent questions (diversity pressure). */
  techniqueCounts: Record<string, number>;
  /** Recent formal-verification failures in this slot (mathematical errors, NOT difficulty feedback). */
  formalFailures?: string[];
}

export interface GeneratedItem {
  candidate: CandidateQuestionT;
  meta: Record<string, unknown>;
}

export interface BlindSolveResult {
  choice: number; // 0-3
  confidence: number; // 0-1
  concerns: string[];
}

export interface LearningInput {
  slot: number;
  slotName: string;
  character: string;
  profile: GeneratorProfileT;
  stats: { reviewed: number; too_easy: number; just_right: number; too_hard: number; invalid: number };
  examples: ExampleQuestion[];
}

export interface ProfileProposal {
  patterns: string[];
  editorial_instructions: string[];
  preferred_add: string[];
  forbidden_add: string[];
  target_difficulty_delta: number;
  rationale: string;
}

export interface GeneratorProvider {
  id: "anthropic" | "procedural";
  model: string | null;
  /** True for development adapters that are not real AI generation. */
  devAdapter: boolean;
  generate(req: GenerationRequest): Promise<{ items: GeneratedItem[]; usage?: Record<string, unknown> }>;
  /** Independent solve without seeing the answer key (reasoning check). */
  blindSolve?(q: { statement: string; options: string[] }): Promise<BlindSolveResult>;
  /** AI-assisted analysis of feedback → proposed profile edits. */
  proposeProfile?(input: LearningInput): Promise<ProfileProposal>;
}

/** A blind-solve request: statement and options only, never the key or solution. */
export interface SolverQuestion {
  statement: string;
  options: string[];
}

export interface SolverAnswer extends BlindSolveResult {
  /** Actual cost of this call in USD. */
  costUsd: number;
  /** Model that served the call. */
  model: string;
}

/** One rung of the auto-judge ladder. Implemented for Anthropic models; other providers plug in here. */
export interface Solver {
  label: string;
  /** Upper bound on the cost of one solve of `q`, used to enforce the per-run cap before calling. */
  worstCaseCostUsd(q: SolverQuestion): number;
  /** Must stop (reject) promptly when `signal` aborts; the judge also stops waiting on its own. */
  solve(q: SolverQuestion, signal?: AbortSignal): Promise<SolverAnswer>;
}
