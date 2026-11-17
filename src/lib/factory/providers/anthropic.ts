/**
 * Claude-backed generator (server-side only; ANTHROPIC_API_KEY never reaches the browser).
 * Uses structured outputs so responses are schema-constrained, then re-validates
 * with zod. Server-side refusal fallbacks are enabled.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { WireBatch, fromWire } from "@/lib/schemas/question";
import type { CandidateQuestionT } from "@/lib/schemas/question";
import { BLIND_SOLVER_SYSTEM, GENERATOR_SYSTEM, LEARNING_SYSTEM, generatorUserPrompt, learningUserPrompt } from "../prompts";
import type { BlindSolveResult, GenerationRequest, GeneratorProvider, LearningInput, ProfileProposal } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";

const BlindSolve = z.object({
  choice: z.enum(["A", "B", "C", "D"]),
  confidence: z.number(),
  concerns: z.array(z.string()),
  solution_sketch: z.string(),
});

const Proposal = z.object({
  patterns: z.array(z.string()),
  editorial_instructions: z.array(z.string()),
  preferred_add: z.array(z.string()),
  forbidden_add: z.array(z.string()),
  target_difficulty_delta: z.number(),
  rationale: z.string(),
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

export async function structured<T extends z.ZodType>(opts: {
  model: string;
  system: string;
  user: string;
  schema: T;
  effort: "low" | "medium" | "high" | "xhigh";
  maxTokens: number;
  /** Server-side refusal fallbacks (default on). Off for blind-solve ladders, where the model identity matters. */
  fallbacks?: boolean;
}): Promise<{ data: z.infer<T>; usage: Record<string, unknown>; model: string }> {
  const stream = getClient().beta.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.fallbacks === false ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("the model declined this request (refusal)");
  if (msg.stop_reason === "max_tokens") throw new Error("generation hit max_tokens; request fewer questions per batch");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("model output was not valid JSON");
  }
  const data = opts.schema.parse(raw);
  return { data, usage: { ...msg.usage } as Record<string, unknown>, model: msg.model };
}

/** One blind solve on a specific model and effort (auto-judge ladder rung). No fallbacks: the rung must be this model. */
export async function blindSolveOn(
  model: string,
  effort: "low" | "medium" | "high" | "xhigh",
  maxTokens: number,
  q: { statement: string; options: string[] },
): Promise<BlindSolveResult & { usage: Record<string, unknown>; model: string }> {
  const { data, usage, model: served } = await structured({
    model,
    system: BLIND_SOLVER_SYSTEM,
    user: blindSolveUserPrompt(q),
    schema: BlindSolve,
    effort,
    maxTokens,
    fallbacks: false,
  });
  return { choice: "ABCD".indexOf(data.choice), confidence: data.confidence, concerns: data.concerns, usage, model: served };
}

export function blindSolveUserPrompt(q: { statement: string; options: string[] }): string {
  return `${q.statement}\n\n${q.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join("\n")}`;
}

export function anthropicProvider(modelOverride?: string | null): GeneratorProvider {
  const model = modelOverride || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  return {
    id: "anthropic",
    model,
    devAdapter: false,
    async generate(req: GenerationRequest) {
      const { data, usage, model: served } = await structured({
        model,
        system: GENERATOR_SYSTEM,
        user: generatorUserPrompt(req),
        schema: WireBatch,
        effort: "high",
        maxTokens: 64000,
      });
      return {
        // Shape is re-validated (including the diagram) by CandidateQuestion in the pipeline.
        items: data.questions.map((w) => ({
          candidate: { ...(fromWire(w) as CandidateQuestionT), template_id: null },
          meta: { served_model: served },
        })),
        usage,
      };
    },
    async blindSolve(q): Promise<BlindSolveResult> {
      const { data } = await structured({
        model,
        system: BLIND_SOLVER_SYSTEM,
        user: blindSolveUserPrompt(q),
        schema: BlindSolve,
        effort: "high",
        maxTokens: 32000,
      });
      return { choice: "ABCD".indexOf(data.choice), confidence: data.confidence, concerns: data.concerns };
    },
    async proposeProfile(input: LearningInput): Promise<ProfileProposal> {
      const { data } = await structured({
        model,
        system: LEARNING_SYSTEM,
        user: learningUserPrompt(input),
        schema: Proposal,
        effort: "high",
        maxTokens: 32000,
      });
      return { ...data, target_difficulty_delta: Math.max(-1.5, Math.min(1.5, data.target_difficulty_delta)) };
    },
  };
}
