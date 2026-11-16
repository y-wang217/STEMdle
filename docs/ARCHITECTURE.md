# Mathdle architecture map

Verified against source at commit `f10af32` using the Graphify code graph plus reading the code.
`file:line` references are to that commit. Re-verify before relying on a line number.

## Pipeline at a glance

```
ADMIN / FACTORY (server)                                  PLAYER (server-authoritative)
bucket_profiles → generator_versions (versioned profile)  /  page.tsx (RSC) ─ todayChallenge()
   │ POST /api/admin/buckets/[slot]/generate               │                    └ activateDate()  ← cron /api/cron/daily too
   ▼ startGenerationBatch → after(): executeBatch          ▼
providers/{anthropic | procedural}  ──► CandidateQuestion (zod, src/lib/schemas/question.ts)
   ▼ insertQuestion (immutable question_versions + options)    Game.tsx (client) ─fetch─► /api/game/{start,state,answer,skip,results}
validateVersions: zod+structure, KaTeX (splitMath),              ▼                         ▼
   SymPy validator [Python, spawn/HTTP], duplicates,         QuestionView → Tex (KaTeX)    engine.ts state machine
   AI blind solve → question_validations, recomputeStatus     Diagram (JSXGraph, lazy)       (game_runs, answer_submissions)
   ▼ enqueueLean (async; never blocks)                       Results (solutions, practice, share, leaderboard)
processLeanQueue (cron/admin) → Lean kernel (Vercel Sandbox)
   ▼ editor review (feedback, learning → new generator version)
composer.autoCompose → approveChallenge ──DB trigger re-checks 8 approved+validated, no Lean refutation──► daily_challenges
```

## Systems (status as implemented)

| Area | Where | Notes |
|---|---|---|
| Categories | `src/lib/buckets/defaults.ts` `SLOT_SEEDS`; `bucket_profiles` table | 8 fixed **maths** slots (Arithmetic … Euclid II). Slot = category = difficulty position. Not shown to players. |
| Generation | `src/lib/factory/pipeline.ts` `startGenerationBatch`/`executeBatch` | Providers: `providers/anthropic.ts` (Claude, structured output) or `providers/procedural.ts` → `procedural/index.ts` `templatesBySlot` (41 templates, `bucket1..8.ts`). |
| Difficulty | profile `difficulty_band`, `learning.ts`, `metrics.ts` | Human ↑/↓ judgments (`feedback.ts`) → `learning.ts` drafts a new generator version. No automatic classifier. |
| Ordering / daily selection | `src/lib/composer.ts` `autoCompose` → `approveChallenge` | Deterministic by DB state: per slot, oldest approved never-used question not structurally similar to ±60 days. **No RNG/seed** in daily selection. Same `challenge_id` ⇒ same questions/order for all. |
| Randomness / seeding | `procedural/rng.ts` `Rng`; `generation_batches.seed` | Only for generation (reproducible procedural batches). |
| Storage | `supabase/migrations/*.sql`, `src/lib/factory/store.ts` | Immutable `question_versions`/`question_options`; `challenge_questions` pins a version. |
| Answer generation & correctness | candidate contract (`schemas/question.ts`) + `validator/mathdle_validator.py` `validate_candidate` | SymPy recomputes the answer, checks exactly one option equals it, pairwise non-equivalence, TeX↔value, traps. |
| Equivalence checking | Python validator only | Players tap one of 4 options; there is **no free-text answer input** and no runtime equivalence check. |
| Lean | `src/lib/lean/*`, `validator/lean_export.py`, `lean/` (toolchain pins only) | Implemented. Async after validation; admin/cron only; a refutation blocks publication via SQL trigger (`20261115000004_lean_verification.sql:82`). |
| TeX | `src/lib/math/segments.ts` `splitMath` → `components/Tex.tsx` (render) and `math/tex-check.ts` (validation) | Shared splitter = render/validate contract. |
| Gameplay engine | `src/lib/game/engine.ts` | `startRun`, `getState`, `submitAnswer` (correct ⇒ next slot; wrong ⇒ `failed`; slot 8 ⇒ `cleared`), `skipQuestion` (⇒ `skipped`), `getResults`, `sharePattern`. |
| Daily reset | `src/lib/time.ts` (`America/Toronto`), `game/challenge.ts` `todayChallenge` | Lazy publish on first request after midnight + `vercel.json` cron 04:05/05:05 UTC. |
| Persistence w/o accounts | `src/lib/game/identity.ts` | httpOnly cookie `mathdle_pid`; DB stores only HMAC. Run state is server-side. |
| Scoring consumers | `engine.ts:116-121`, `invalidation.ts`, `leaderboard.ts`, `api.ts` `shareText`, `Results.tsx` | `score + score_adjustment` everywhere. |
| Frontend | `src/app/page.tsx` (RSC) → `components/game/{Game,QuestionView,Results,ui}.tsx`; admin under `components/admin/` | Perf-sensitive: `Diagram.tsx` (JSXGraph dynamic `import()`), `Tex.tsx` (KaTeX, SSR-capable). |
| Backend / deploy | `src/app/api/**/route.ts`, `vercel.json` crons, `validator/` (separate Vercel Python project), Supabase | RLS on, no policies: browsers never touch the DB. |

## Coupling

**Clean seams**
- Generation ⇄ gameplay: only through DB rows (`question_versions` pinned by `challenge_questions`). Engine never imports factory code.
- Providers: `GeneratorProvider` interface (`providers/types.ts`); pipeline is provider-agnostic.
- Lean: enqueue-only from the pipeline; results are read separately; never on the play path.
- Validator: JSON over stdin/HTTP; swappable between local spawn and the hosted service.

**Tight coupling / hazards**
- **The number 8** is hard-coded in 30+ places: SQL `CHECK (slot between 1 and 8)` and the publication trigger (`init.sql:29,192,216,230,238,414`), zod bodies in game/admin routes, `engine.ts:116`, `composer.ts:74,123,142`, `pipeline.ts:58`, `invalidation.ts:47,53`, `api.ts:16`, `Game.tsx:152,212`, `Results.tsx:44,98,264,272`, admin pages/components, `prompts.ts:7`, `layout.tsx:8`, `scripts/demo.ts`. Find them with
  `grep -rnE "max\(8\)|<= ?8|< ?8\b|/8|length: 8|1, 2, 3, 4, 5, 6, 7, 8|between 1 and 8|eight" src scripts supabase`.
- **Wire types are duplicated**: `PublicQuestion` in `engine.ts:32` and `Game.tsx:13`; `ResultQuestion` mirrored in `Results.tsx`. Nothing checks they agree.
- **Business rules in SQL triggers** (publication, immutability, Lean refutation) are invisible from TS.
- **Category = slot = difficulty rank.** A new category cannot be added without changing slot count or replacing a slot.

## Seams the code graph cannot see

| From | To | Mechanism |
|---|---|---|
| `Game.tsx` `api()` | `src/app/api/game/*/route.ts` | `fetch` URL strings |
| `validator-client.ts` `runSympyValidator` | `validator/cli.py` / `validator/api/validate.py` → `validate_candidate` | child process or HTTP |
| `lean/export-client.ts` | `validator/lean_export.py` | child process or HTTP |
| TS `sql\`...\`` | tables, views, triggers | SQL inside template strings |
| `approveChallenge` / `activateDate` | `guard_daily_challenge()` / `question_version_publishable()` (`init.sql:381,398`), redefined in `lean_verification.sql:82` | DB raises on invalid publication |
| `vercel.json` crons | `/api/cron/daily` | config |

## Architectural question playbook

Graph commands assume `sh scripts/graph.sh` has run. "Graph gives" says what the graph returns; "Also check" is what you must add.

1. **Add a question category?** `graphify affected "src/lib/buckets/defaults.ts::GeneratorProfile" --depth 2`, `graphify explain "templatesBySlot"`.
   Also check: the 8-literal grep above, SQL CHECKs and trigger (new migration), `SLOT_SEEDS`, `scripts/seed.ts`, `prompts.ts`, UI cell arrays, share text, leaderboard copy. Replacing a slot's category instead only touches `SLOT_SEEDS`/the DB profile and `bucketN.ts`.
2. **How does a generated question reach the screen?** `graphify explain "executeBatch()"`, `explain "activateDate()"`, `explain "getState()"`, `explain "Game()"`.
   Also check: the fetch seam (`Game.tsx:88,108`) and composer/approval (`composer.ts`).
3. **Where is correctness verified?** `graphify explain "validateVersions()"`, `explain "validate_candidate()"`, `explain "processLeanQueue()"`.
   Also check: the TS→Python seam and the SQL publication trigger.
4. **What depends on answer validation?** `graphify affected "src/lib/factory/validate.ts::validateVersions()" --depth 2`.
   Gameplay correctness itself is just `question_options.is_correct` (`engine.ts:105-110`).
5. **How does the daily reset work?** `graphify explain "todayChallenge()"`, `path "dailyJob()" "activateDate()"`. Also: `vercel.json`.
6. **What breaks if scoring changes?** `graphify affected "src/lib/game/engine.ts::finalize()"`, `explain "leaderboard()"`, `explain "correctRunScore()"`.
   Also check: SQL in `leaderboard.ts`, `question_performance` view, `Results.tsx` copy, `shareText`, trigger on finalized runs.
7. **Which paths handle skips?** `graphify affected "src/lib/game/engine.ts::skipQuestion()"`.
   Also check: `grep -rn skipped src supabase` (Results practice mode, `sharePattern`, analytics, admin published page).
8. **Change generation without touching gameplay?** Confirm with directed `graphify path "executeBatch()" "submitAnswer()"` and the reverse (no path either way), and `graphify affected "src/lib/factory/pipeline.ts::executeBatch()" --depth 3` (no engine nodes). Keep the `CandidateQuestion` contract and `question_versions` shape stable.
   Do not use `--undirected` here: it "connects" them through the shared `HttpError` utility.
9. **Which frontend depends on the question format?** `graphify affected "DiagramSpecT" --depth 1` and `affected "src/lib/schemas/question.ts::CandidateQuestion" --depth 2`.
   Also check: the duplicated `PublicQuestion`/`ResultQuestion` types.
10. **How does Lean interact with generation?** `graphify explain "enqueueLean()"`, `explain "processLeanQueue()"`, `explain "recentFormalFailures()"` (formal failures feed back into the next generation prompt).
