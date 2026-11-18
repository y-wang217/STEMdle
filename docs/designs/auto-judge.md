# auto-judge: automated difficulty judge (model ladder + player override)

**Risk:** High (adds an admin capability that writes judgments, which can move questions to `approved`, and lets the feedback path record calibration judgments on published questions).

## Problem
Difficulty calibration needs a human verdict (too easy / just right / too hard / invalid) for every validated question before `proposeNextVersion` (`src/lib/factory/learning.ts`) can learn anything. The owner is the bottleneck: the factory produces batches faster than one person can press arrow keys, so generator versions stall.

## Approach
A judge that writes the **same** judgments through the **same** path (`recordJudgment` in `src/lib/factory/feedback.ts`), under its own identity.

1. **Model ladder** (`src/lib/factory/auto-judge-core.ts`, pure). Each `ready` question is solved blind (statement + options, no key, no solution) by solvers cheapest first. Default ladder: `claude-haiku-5-5` (low effort) → `claude-sonnet-5-5` (medium) → `claude-opus-5-5` (low) → `claude-opus-5-5` (high). The run stops at the first rung that picks the validated answer; its 1-based index is the estimated difficulty. Compared with the slot's `target_rungs` band: below → `too_easy`, inside → `just_right`, above → `too_hard`.
   Default bands: slot 1 `[1,1]`, 2 `[1,2]`, 3 `[1,2]`, 4 `[2,2]`, 5 `[2,3]`, 6 `[3,3]`, 7 `[3,4]`, 8 `[4,4]` (slot 1 should fall to the first rung, slot 8 only to the top).
2. **Configurable per slot.** `GeneratorProfile` (`src/lib/buckets/defaults.ts`) gains an optional `judge` object `{ ladder: [{ provider, model, effort, max_tokens }], target_rungs, target_solve_rate }`. Absent → per-slot defaults from `defaultJudgeConfig(slot)`. Existing stored profiles keep parsing (the field is optional), and `proposeNextVersion` carries it forward because it clones the profile.
3. **Solver interface** (`src/lib/factory/providers/solvers.ts`). `Solver { solve(q) → { choice, confidence, concerns, costUsd }, worstCaseCostUsd(q) }`. `provider: "anthropic"` is implemented with the existing `structured()` helper (`providers/anthropic.ts`) and `BLIND_SOLVER_SYSTEM`; server-side refusal fallbacks are **off** for solver calls so a rung is never silently answered by another model. `provider: "external"` is a registration slot (`registerExternalSolver`) for a non-Anthropic model; nothing is registered yet, so a ladder naming it fails fast with a clear error.
4. **Never auto-approve doubtful math.** A question is flagged for math review, not judged, when: no rung solves it; the solving rung reports concerns (ambiguity, two defensible answers, …); or two or more lower rungs confidently (≥ 0.9) chose the *same* wrong option. Flagging appends a `question_validations` row for the current version (`status = needs_review`, `engine = auto-judge`, previous checks + an `auto_judge` warn check) and recomputes status → `needs_review`. Validation rows are append-only and this can only demote a question; `validate.ts`, the SymPy validator and Lean are untouched.
5. **Identity.** Judgments are recorded by `auto-judge@mathdle.local`, a disabled admin (same pattern as the demo reviewer in `scripts/demo.ts`), with notes prefixed `AUTO-JUDGE [ladder]` or `AUTO-JUDGE [players]` describing the evidence. Human judgments are never overwritten.
6. **Player data overrides the ladder.** `MIN_PLAYS_FOR_OVERRIDE = 30` answered (non-skipped) attempts, summed over published challenges in `question_performance`. At or above it, the solve rate is compared with `target_solve_rate` (default slot 1 `[0.75, 0.97]` … slot 8 `[0.10, 0.45]`) and the result replaces a ladder judgment (no solver is called). Played questions are in published challenges, which `recordJudgment` refuses; it gains an `allowPublished` option limited to difficulty judgments (`too_easy`/`just_right`/`too_hard`). For published questions `recomputeStatus` already returns early, so this records calibration evidence without changing status.
7. **Runner and route.** `autoJudge({ slot?, batchId?, limit, costCapUsd, solverFactory? })` in `src/lib/factory/auto-judge.ts`; `scripts/auto-judge.ts` (CLI) and `POST /api/admin/auto-judge` (admin-only, rate-limited, audited) judge one batch.
8. **Cost cap.** A per-run budget: before every solver call the worst-case cost (estimated input + `max_tokens` output at list price) is reserved; if it does not fit the call is not made and the run stops with `stopped: "cost_cap"`. Actual cost from `usage` replaces the reservation. Spend therefore never exceeds the cap. Default cap `AUTO_JUDGE_COST_CAP_USD` or $2; the route accepts at most $20.

## Acceptance criteria
- **AC1.** Given ladder results, the core maps the lowest solving rung against the slot's band to `too_easy` / `just_right` / `too_hard` (slot 1 solved at rung 1 → just right; at rung 2 → too hard; slot 8 solved at rung 3 → too easy; at rung 4 → just right).
- **AC2.** The ladder runs cheapest first and stops at the first rung that solves the question; later rungs are not called.
- **AC3.** A question no rung solves, whose solving rung reports concerns, or where ≥ 2 lower rungs confidently agree on the same wrong option is flagged for math review: no judgment is recorded and its status becomes `needs_review`, never `approved`.
- **AC4.** Running `autoJudge` on a validated procedural batch records judgments through `recordJudgment` by the disabled `auto-judge@mathdle.local` admin with an `AUTO-JUDGE` note; `just_right` questions become `approved`, others `reviewed`. Re-running judges nothing new and calls no solver.
- **AC5.** With a cost cap smaller than the run needs, the run stops before exceeding it (`spentUsd ≤ costCapUsd`, `stopped = "cost_cap"`), and unjudged questions stay `ready`.
- **AC6.** Once a question has ≥ `MIN_PLAYS_FOR_OVERRIDE` answers, its player solve rate decides the judgment (`AUTO-JUDGE [players]`), replacing a ladder judgment without calling any solver; below the threshold the ladder decides. Human judgments are not overridden.
- **AC7.** An admin `POST /api/admin/auto-judge` with `{ batchId }` (or `{ slot }`) gets `202` and the run continues in the background (`after()`, like generation), ending in an `auto_judge_run` audit row with the counts and spend. Unauthenticated → 401; no batch/slot → 400; no `ANTHROPIC_API_KEY` → 400 and nothing runs.
- **AC9.** If a human judges or edits a question while a run is solving it, the run records nothing for it (`skipped`), and the human's judgment stands (e.g. `invalid` stays `rejected`). The run also stops starting rungs at its deadline, aborts calls still running at its hard deadline, and still writes the `auto_judge_run` audit row.
- **AC8.** No test calls the real API (`ANTHROPIC_API_KEY` is empty in the test env and every test injects stub solvers).

## Test plan
| AC | Test (file › name) | Kind |
|---|---|---|
| AC1 | tests/unit/auto-judge.test.ts › maps the solving rung against the slot band | unit |
| AC2 | tests/unit/auto-judge.test.ts › runs cheapest first and stops at the first solving rung | unit |
| AC3 | tests/unit/auto-judge.test.ts › flags unsolved / concerns / confident disagreement; tests/integration/auto-judge.test.ts › judges a procedural batch end to end | unit + integration |
| AC4 | tests/integration/auto-judge.test.ts › judges a procedural batch end to end; › is idempotent | integration |
| AC5 | tests/unit/auto-judge.test.ts › budget refuses a call that would exceed the cap; tests/integration/auto-judge.test.ts › stops at the cost cap | unit + integration |
| AC6 | tests/unit/auto-judge.test.ts › player data overrides the ladder at the threshold; tests/integration/auto-judge.test.ts › player solve rate overrides a ladder judgment | unit + integration |
| AC7 | tests/e2e/admin.spec.ts › admin pages and APIs require sign-in; › auto-judge route validates input and never runs without an API key; tests/integration/auto-judge.test.ts › judges a procedural batch end to end (audit row) | e2e + integration |
| AC9 | tests/integration/auto-judge.test.ts › never overwrites a judgment a human makes while the ladder is running; › stops at the run deadline and still writes the audit row; › aborts a hung solver call at the hard deadline and still writes the audit row; › records nothing for a question edited to a new version during the run; tests/unit/auto-judge.test.ts › starts no rung after the run deadline; › aborts an in-flight call at the hard deadline | integration + unit |
| AC8 | vitest.config.ts sets `ANTHROPIC_API_KEY: ""`; all suites pass a `solverFactory` stub | config |

## Risks
- **Noisy single solves.** One attempt per rung is a coarse estimate. Mitigated by player override once data exists, and by learning aggregating many judgments; per-rung retries are a follow-up.
- **Solver concerns are noisy at low rungs.** Only the solving rung's concerns flag a question; lower-rung concerns are kept in the note.
- **API errors / refusals.** The question is skipped (left `ready`) and reported, never flagged or judged.
- **Over-approval.** `just_right` makes a question `approved`, but a daily challenge still needs an explicit human approval (`approveChallenge`) and its DB trigger re-checks validation.
- **Cost.** Hard cap per run; route caps the cap at $20 and is rate-limited.

## Decisions
| Decision | Default chosen | Why |
|---|---|---|
| Schema change | None (no migration) | Flags reuse `question_validations` (append-only), identity reuses `admin_users`, evidence lives in the judgment note and `audit_log`. Keeps the PR out of the migration lane. |
| Profile field | `judge` optional on `GeneratorProfile`; per-slot defaults in code | Old profiles keep parsing; slots can be tuned through the existing profile editor. |
| Default ladder | Haiku 5.5 low → Sonnet 5.5 medium → Opus 5.5 low → Opus 5.5 high | Task spec; Sonnet at medium sits between Haiku and Opus-low. |
| Refusal fallbacks on solver calls | Off | A fallback would answer with a different model and corrupt the rung estimate. |
| Override threshold | `MIN_PLAYS_FOR_OVERRIDE = 30` answers | Enough for a ±0.18 95% interval on a 0.5 solve rate; a constant as asked. |
| Published questions in feedback | `recordJudgment({ allowPublished: true })` for difficulty judgments only | Played questions are always published; status is unaffected there. |
| Flag trigger on concerns | Only the solving rung's concerns | Low-rung models over-report concerns; flooding review defeats the purpose. |
| Default cost cap | $2 per run (env `AUTO_JUDGE_COST_CAP_USD`), route max $20 | Worst case for one question at the default ladder is ≈ $1.13 (Haiku $0.008 + Sonnet $0.16 + Opus-low $0.33 + Opus-high $0.65, nearly all of it `max_tokens` output). Prices: Anthropic's published per-model table as of 2026-11: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per MTok in/out; cache writes 1.25×, reads 0.1× input. |
| Route runs in the background | `202` + `after()`, soft deadline 150 s, hard deadline 270 s, audit row in `finally` | `after()` returns the response early but still runs inside the route's `maxDuration` (Next docs, `after` › Duration). So the run has two deadlines. After 150 s no new rung starts. At `maxDuration − 30 s` (270 s) any call still running is aborted: an `AbortSignal` cancels the SDK request, and the judge also stops waiting, so a stuck solver cannot hold it. An aborted call is billed at its worst-case reservation. The remaining 30 s cover writing results and the `auto_judge_run` audit row, which is written in `finally` with partial counts, spend and any error. Questions not finished stay `ready`. |
| Stale evidence | Re-check under the row lock before every write | A run takes minutes. Each ladder write re-checks (with `for update`, via a `recordJudgment` precondition) that the question is still `ready`, on the same version, and unjudged. Each player write re-checks that the latest judgment is not a human's. Otherwise the item is `skipped`. |
| Runner script | `npx tsx scripts/auto-judge.ts`, no npm script | `package.json` is a human-merge path; avoided for one alias. |
| Risk / lane | High → `needs-human-merge` | New admin capability that can approve questions. |

## Follow-ups
- Admin UI button and run history view for auto-judge runs.
- Several attempts per rung (majority vote) for a less noisy estimate.
- Hook into `autoLearn` from `claude/gallant-sagan-jz8j40` once merged: call it after a run so auto judgments trigger learning without a manual click.
- Re-learning from player judgments on questions already consumed into `training_question_ids`.
