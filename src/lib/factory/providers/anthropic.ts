/**
 * Claude-backed generator (server-side only; ANTHROPIC_API_KEY never reaches the browser).
 * Uses structured outputs so responses are schema-constrained, then re-validates
 * with zod. Server-side refusal fallbacks are enabled.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CandidateBatch } from "@/lib/schemas/question";
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

async function structured<T extends z.ZodType>(opts: {
  model: string;
  system: string;
  user: string;
  schema: T;
  effort: "low" | "medium" | "high" | "xhigh";
  maxTokens: number;
}): Promise<{ data: z.infer<T>; usage: Record<string, unknown>; model: string }> {
  const stream = getClient().beta.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
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
        schema: CandidateBatch,
        effort: "high",
        maxTokens: 64000,
      });
      return {
        items: data.questions.map((candidate) => ({ candidate: { ...candidate, template_id: null }, meta: { served_model: served } })),
        usage,
      };
    },
    async blindSolve(q): Promise<BlindSolveResult> {
      const { data } = await structured({
        model,
        system: BLIND_SOLVER_SYSTEM,
        user: `${q.statement}\n\n${q.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join("\n")}`,
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
