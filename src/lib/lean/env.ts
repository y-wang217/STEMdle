/** Pinned verification environment (must match lean/lean-toolchain and lean/lakefile.toml). */
export const LEAN_VERSION = "4.35.0";
export const MATHLIB_VERSION = "v4.35.0";
/** Changing Lean, Mathlib, the checker template or the tactic cascade must bump this (invalidates the proof cache). */
export const LEAN_ENV_VERSION = `lean-${LEAN_VERSION}+mathlib-${MATHLIB_VERSION}+checker-3`;
/** Version of the whole pipeline (eligibility, formalization, audit). Recorded on every verification. */
export const LEAN_PIPELINE_VERSION = "lean-pipeline-1";

/** Axioms a proof may depend on. Anything else (sorryAx, user axioms, Lean.ofReduceBool…) is rejected. */
export const ALLOWED_AXIOMS = new Set(["propext", "Classical.choice", "Quot.sound"]);

export const LEAN_CHECK_TIMEOUT_MS = Number(process.env.LEAN_CHECK_TIMEOUT_MS ?? 150_000);
export const LEAN_MAX_JOBS_PER_RUN = Number(process.env.LEAN_MAX_JOBS_PER_RUN ?? 4);
export const LEAN_AI_PROOF_ROUNDS = Number(process.env.LEAN_AI_PROOF_ROUNDS ?? 1);
