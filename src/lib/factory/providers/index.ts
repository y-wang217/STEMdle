import { anthropicProvider } from "./anthropic";
import { proceduralProvider } from "./procedural";
import type { GeneratorProvider } from "./types";

export type ProviderId = "anthropic" | "procedural";

export function availableProviders(): { id: ProviderId; available: boolean; devAdapter: boolean; reason?: string }[] {
  return [
    {
      id: "anthropic",
      available: Boolean(process.env.ANTHROPIC_API_KEY),
      devAdapter: false,
      reason: process.env.ANTHROPIC_API_KEY ? undefined : "ANTHROPIC_API_KEY not configured",
    },
    { id: "procedural", available: true, devAdapter: true },
  ];
}

export function defaultProviderId(): ProviderId {
  const env = process.env.GENERATOR_PROVIDER as ProviderId | undefined;
  if (env === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (env === "procedural") return "procedural";
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "procedural";
}

export function getProvider(id: ProviderId, model?: string | null): GeneratorProvider {
  if (id === "anthropic") return anthropicProvider(model);
  return proceduralProvider;
}
