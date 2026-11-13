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
