import { describe, expect, it } from "vitest";
import { learnDiagramPolicy } from "@/lib/factory/diagram-policy";
import { BucketConfig, GeneratorProfile, SLOT_SEEDS, defaultProfile } from "@/lib/buckets/defaults";
import { generatorUserPrompt } from "@/lib/factory/prompts";

describe("diagram policy learning", () => {
  it("goes straight to required when a note says geometry must have a diagram", () => {
    expect(learnDiagramPolicy("when_helpful", ["needs a diagram", "it seems like they all need a diagram. geometry must have a diagram", null])).toEqual({
      to: "required",
      mentions: 2,
    });
  });
  it("steps up one level after two plain requests", () => {
    expect(learnDiagramPolicy("when_helpful", ["needs a diagram", "rename to x- and y- axes, and needs a diagram"])?.to).toBe("preferred");
    expect(learnDiagramPolicy("preferred", ["needs a diagram", "add a figure"])?.to).toBe("required");
  });
  it("ignores a single request, unrelated notes, and never lowers", () => {
    expect(learnDiagramPolicy("when_helpful", ["needs a diagram", "only use special angles"])).toBeNull();
    expect(learnDiagramPolicy("when_helpful", ["too wordy", null])).toBeNull();
    expect(learnDiagramPolicy("required", ["needs a diagram", "must have a diagram"])).toBeNull();
  });
});

describe("profile compatibility", () => {
  it("profiles and configs stored before diagram policy / auto-learn still parse", () => {
    const legacy = { ...defaultProfile(SLOT_SEEDS[0]) } as Record<string, unknown>;
    delete legacy.diagrams;
    expect(GeneratorProfile.parse(legacy).diagrams).toBe("when_helpful");
    const cfg = BucketConfig.parse({ difficulty_band: [1, 3], calibration: { min_fresh_reviews: 10, min_just_right_rate: 0.6, max_invalid_rate: 0.1 } });
    expect(cfg.auto_learn).toEqual({ enabled: true, min_judgments: 6 });
  });
  it("the generator prompt states the slot's diagram policy", () => {
    const profile = { ...defaultProfile(SLOT_SEEDS[2]) };
    expect(profile.diagrams).toBe("required");
    const prompt = generatorUserPrompt({ slot: 3, slotName: "Geometry I", character: "", profile, count: 5, seed: 1, examples: [], recentStatements: [], techniqueCounts: {} });
    expect(prompt).toContain("Diagram policy: REQUIRED");
  });
});
