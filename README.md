# Mathdle

A free, daily, eight-question mathematics game — and the human-trained **question factory** that feeds it.

* **Players** get eight multiple-choice questions a day, rising from mental arithmetic to a Euclid-style “boss” problem. One wrong answer ends the run. No account, no timer on screen, solutions immediately after.
* **The founder/editor** generates candidate questions per slot, lets a SymPy validation pipeline reject anything that is not provably right, calibrates difficulty with the arrow keys, and lets that feedback reshape each slot’s versioned generator profile. Approved questions are composed into daily sets, previewed, approved and scheduled.

> Guiding principle: the daily eight-question ritual is the product; the human-trained question factory is its engine.

---

## Contents

1. [Quick start (local)](#quick-start-local)
2. [Configuration & credentials](#configuration--credentials)
3. [Architecture](#architecture)
4. [The question factory](#the-question-factory)
5. [Daily composer & publication](#daily-composer--publication)
6. [Player game, identity & leaderboard](#player-game-identity--leaderboard)
7. [Security model](#security-model)
8. [Testing](#testing)
9. [Deployment (Supabase + Vercel)](#deployment-supabase--vercel)
10. [Operations runbook](#operations-runbook)
11. [Known limitations](#known-limitations)

---

## Quick start (local)

Requirements: Node 20.9+, Python 3.11+ with `pip`, PostgreSQL 15+ (local or Supabase).

```bash
npm install
pip install -r validator/requirements.txt      # sympy + lark
cp .env.example .env                            # then set DATABASE_URL and APP_SECRET
npm run db:migrate                              # applies supabase/migrations/*.sql
npm run db:seed                                 # eight bucket profiles + generator v1 (no questions)
npm run admin:create -- you@example.com 'a long passphrase'
npm run dev                                     # http://localhost:3000  · admin at /admin
```

Optional, to try the player game immediately without reviewing questions by hand:

```bash
npx tsx scripts/demo.ts 3    # LOCAL DEMO ONLY: generates, auto-approves (as demo-reviewer@mathdle.local) and schedules 3 days
```

Demo judgments are recorded by a disabled `demo-reviewer@mathdle.local` admin with the note `DEMO: automated judgment for local demonstration`, so they are always distinguishable from genuine editorial decisions. The script refuses to run with `NODE_ENV=production`.

### The founder’s loop

1. `/admin` → pick a bucket → **Generate batch** (provider `anthropic` if a key is configured, otherwise the `procedural` development adapter).
2. **Review this batch** → judge with the keyboard (below). No action is needed for a “just right” question: press Enter.
3. Bucket page → **Learn from feedback → draft new version**. Inspect the proposed changes, then **Activate**.
4. Generate again; the new batch uses the new version. Repeat until a version is **calibrated** on fresh questions.
5. `/admin/composer` → pick a date → **Assemble candidate set** → replace slots as needed → **Preview as player** → **Approve & schedule**.
6. Play on a phone at `/` once the date arrives (midnight America/Toronto).

### Review keyboard

| Key | Action |
|---|---|
| ↑ | Too hard |
| ↓ | Too easy |
| Enter or → | Save and advance (no judgment ⇒ **just right**) |
| ← | Previous question (records nothing) |
| X | Flag invalid / bad |
| Esc | Clear the pending judgment (or leave the note box) |
| U / Ctrl+Z | Undo the last saved judgment (appends a retraction) |
| N | Write a note that is saved with the judgment |

Shortcuts are ignored while typing in an input. Touch buttons mirror every key.

---

## Configuration & credentials

All variables are documented in [`.env.example`](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Server-side Postgres connection (Supabase: the `postgres` role connection string). Never exposed to the browser. |
| `APP_SECRET` | yes (prod) | 32+ random chars; keys the HMAC used to store player tokens, admin sessions and rate-limit keys. |
| `CRON_SECRET` | yes (prod) | Bearer token required by `/api/cron/daily`. Vercel Cron sends it automatically when set as an env var. |
| `ANTHROPIC_API_KEY` | for AI generation | Enables the Claude generator, blind-solve reasoning check and AI feedback analysis. Server-only. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5-5`. Can also be set per generator profile (`model`). |
| `GENERATOR_PROVIDER` | no | `anthropic` or `procedural` default in the UI. |
| `GENERATION_RATE_LIMIT_PER_HOUR` | no | Batches per admin per hour (default 20). |
| `VALIDATOR_URL`, `VALIDATOR_TOKEN` | on Vercel | Location/secret of the Python validator service. If unset, the server spawns `python3 validator/cli.py`. |
| `PYTHON_BIN` | no | Python executable for the local validator (default `python3`). |
| `MATHDLE_EPOCH` | no | Toronto date of challenge No. 1 (default `2026-11-01`). |
| `RESERVE_TARGET_DAYS` | no | Alert when fewer consecutive approved days remain (default 7). |
| `ALERT_WEBHOOK_URL`, `ERROR_WEBHOOK_URL` | no | Slack-compatible webhooks for operator alerts and server errors. |
| `NEXT_PUBLIC_SITE_URL` | no | URL used in share text. |

**Claude API notes.** Generation uses structured outputs (`output_config.format` with the zod schema), adaptive thinking at `high` effort, streaming, and **server-side refusal fallbacks** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a request declined by safety classifiers is retried on a fallback model inside the same call. Remove `fallbacks` in `src/lib/factory/providers/anthropic.ts` if you prefer a hard failure.

---

## Architecture

```
Next.js 16 (App Router, TypeScript, Tailwind v4)
 ├─ /                       player game (client component, server-authoritative API)
 ├─ /api/game/*, /api/today, /api/leaderboard, /api/player/nickname
 ├─ /admin/*                question factory UI (server components + small client islands)
 ├─ /api/admin/*            authenticated, same-origin mutations
 ├─ /api/cron/daily         midnight activation + reserve alerts (Vercel Cron)
 └─ src/lib
     ├─ factory/            providers (Claude | procedural dev adapter), pipeline, validation, feedback, learning, metrics
     ├─ composer.ts         daily set assembly, similarity, approval, activation
     ├─ game/               identity, engine (state machine), leaderboard, analytics
     └─ db/                 postgres.js client (server only)
validator/                  Python + SymPy validation core, CLI and stdlib HTTP server
supabase/migrations/        schema, triggers (immutability/publication guards), RLS
```

### Data model

`bucket_profiles` (slot definitions as JSON config — change without migrations) → `generator_versions` (versioned profiles: topic, difficulty, preferred/forbidden traits, techniques, misconceptions, example question ids, editorial instructions, model, procedural knobs, `training_question_ids`, `learning_summary`) → `generation_batches` → `questions` → `question_versions` (immutable content) → `question_options` → `question_validations` (append-only reports) and `question_feedback` (append-only judgments).

`daily_challenges` → `challenge_questions` (pins a **question version**). `anonymous_players` → `game_runs` → `run_presentations` + `answer_submissions`. `question_performance` is a live view over real play. Plus `score_corrections`, `audit_log`, `admin_alerts`, `analytics_events`, `rate_limits`, `admin_users`, `admin_sessions`.

Database triggers enforce: append-only feedback/validations/audit/submissions/corrections; immutable question versions and options (new version required); a challenge can only become approved/published when all eight questions are approved, have four options with exactly one correct, and passed validation (or were explicitly math-reviewed after `needs_review`); publication locks the pinned versions; published composition can only change by an audited void; finalized runs are immutable except audited score adjustments.

---

## The question factory

### Generator profiles (one per slot)

| Slot | Category | Character |
|---|---|---|
| 1 | Arithmetic | Easy; mental math, numerical intuition |
| 2 | Algebra | Easy; equations, factoring, substitution |
| 3 | Geometry I | Easy; angles, lengths, area |
| 4 | Graphs | Medium; linear/quadratic functions |
| 5 | Trigonometry | Medium; ratios, identities, exact values |
| 6 | Geometry II | Hard; non-obvious geometric insight |
| 7 | Euclid-style I | Very hard; competition reasoning |
| 8 | Euclid-style II | Extremely hard; hidden elegant trick |

Categories are never shown to players.

### Providers

* **`anthropic`** — Claude writes a batch against the active profile, with curated examples (ideal / too easy / too hard) retrieved from past judgments, recent statements to avoid, and over-used techniques flagged for diversity. Output is schema-constrained JSON.
* **`procedural`** — a **development adapter**, clearly labelled everywhere it appears. 41 hand-written parametrized templates across all eight slots (8 arithmetic, 33 for slots 2–8) that emit the same contract, including misconception-derived distractors, SymPy verification and diagrams. It lets the whole loop run without credentials; its “learning” is a deterministic update of target difficulty and per-template weights.

### Candidate contract (`src/lib/schemas/question.ts`)

Statement (TeX), four options each with a SymPy `value`, exactly one `is_correct`, a `misconception` + `rationale` and a SymPy `derivation` reproducing each trap, full solution, key insight, tags/techniques, estimated difficulty and solve time, an independent `verification.expression` (+ boolean `checks` for domains/extraneous roots, `precision_dp`), an optional structured diagram, and generation metadata.

### Validation pipeline (`src/lib/factory/validate.ts`, `validator/`)

Independent checks; any failure blocks publication; anything that cannot be machine-verified becomes `needs_review` and requires an explicit, audited math review:

1. Schema/structure: four options, exactly one marked correct, non-trivial solution.
2. KaTeX strict render of every TeX segment.
3. SymPy (sandboxed: AST allow-list, no builtins, time limits): independent recomputation; exactly one option equals it and it is the declared one; pairwise non-equivalence (symbolic and numeric); option TeX parsed and cross-checked against its value; rounding/precision; domain and extraneous-root checks; each trap’s derivation reproduces its value; ambiguous multi-solution results rejected.
4. Diagram consistency: references resolve, labelled lengths share one scale, labelled/right angles match coordinates, claimed concyclic points lie on circles, plotted functions are defined; essential diagrams must be accurate constructions.
5. Duplicates: exact duplicate (statement + options) fails; structural near-duplicates are flagged and avoided by the composer.
6. Reasoning check (with Claude): a blind solve without the answer key; disagreement or ambiguity concerns ⇒ `needs_review`.

### Learning from feedback (`src/lib/factory/learning.ts`)

* Judgments are append-only and never rewritten; the analysis is stored separately in the new version’s `learning_summary`.
* “Learn from feedback” consumes judgments not used by any previous version, computes per-template and overall easy/right/hard/invalid rates, adjusts difficulty within the slot’s band, re-weights or disables templates, curates diverse examples for retrieval, turns editor notes into instructions, and (with Claude) proposes generalising editorial instructions. The result is a **draft** version.
* **Automatic upgrades.** When every question in a batch has been judged (and the bucket has at least `auto_learn.min_judgments` new judgments, default 6), learning runs in the background and the new version is **activated automatically**; generating a batch does the same first, so each batch uses everything learned so far. Turn it off per bucket with `"auto_learn": {"enabled": false, ...}` in `bucket_profiles.config`. “Learn now” on the bucket page still proposes a draft for manual activation.
* **Diagram policy** (`when_helpful` / `preferred` / `required`, per generator profile) tells the writer how often to draw. Editor notes asking for a diagram raise it: two requests step it up one level; a note saying diagrams are mandatory (“must”, “all”, “every”) sets `required`.
* Drafts proposed manually must be **activated**. A version can only be **marked calibrated** when it meets the bucket’s thresholds (default ≥10 reviews, ≥60% just right, ≤10% invalid) on **fresh questions it generated that were not in its training set** — never on self-evaluation.
* Live player data is shown next to the calibration metrics but never rewrites a profile.

---

## Daily composer & publication

* **Assemble** picks, per slot, the oldest approved, never-used question that is not structurally similar to anything scheduled ±60 days or already in the set. Replace any slot automatically or choose a specific question. Similarity warnings are listed.
* **Preview as player** renders the exact phone experience.
* **Approve & schedule** — the database re-verifies all eight questions. Approved sets are frozen; revert to draft to edit.
* **Activation** — the first request after midnight America/Toronto publishes that date’s *approved* set (idempotent, transactional), and `/api/cron/daily` (04:05 and 05:05 UTC, covering EDT and EST) does the same proactively. If no approved set exists, players see “Today’s challenge isn’t ready yet” and an alert is raised. **Nothing unapproved is ever published.**
* Reserve: the dashboard and cron alert when fewer than `RESERVE_TARGET_DAYS` consecutive approved days remain.

---

## Player game, identity & leaderboard

* Server-authoritative state machine (`src/lib/game/engine.ts`): one question at a time, graded on the server, one submission per slot (unique constraint), no skipping ahead, timing from database clocks only.
* **Skip** ends the scored run; results then offer every unreached question as clearly-labelled **practice (unranked)**.
* Results: score, eight-cell pattern (🟩 correct, 🟥 wrong, ⬜ skipped, ⬛ not reached), solutions with key insights and why each trap tempts, rank, share text, editable nickname, completion time under “Stats”.
* Leaderboard: score first, then time; runs over 30 minutes keep their score but lose speed ranking.
* Identity: a random secret in an httpOnly cookie; only its HMAC is stored. The public id and nickname are not credentials.

---

## Formal verification (Lean 4 + Mathlib)

Lean is an **additional, asynchronous** check. It never runs during gameplay, never blocks a generation batch, and never approves a question on its own. SymPy validation and your difficulty review are unchanged.

```text
generate → SymPy validation → enqueue Lean job → (after the response / cron / Retry)
  eligibility → formalization → Lean kernel (isolated) → consistency audit → stored result → review UI
```

**What it checks for an eligible question** (all theorem headers are written by Mathdle, never by the AI):

| Theorem | Meaning |
|---|---|
| `mathdle_key` | the answer key satisfies the question |
| `mathdle_excludes_x` | each distractor does **not** |
| `mathdle_distinct` | the four options are pairwise different values |
| `mathdle_refute_*` | attempts to prove the key wrong / a distractor right — success here is a *refutation* |
| `mathdle_unique` | (AI formalizations) nothing else satisfies the question |

**Formalization methods**
* `expression` (deterministic): the question's own SymPy verification expression and option values are exported to closed Lean terms **without evaluating them** (`.doit()` is stripped; finite sums/products become `∑`/`∏ k ∈ Finset.Icc a b`). Bare literals are refused because they would make a vacuous claim. This kernel-checks the arithmetic; whether the expression is what the question asks is left to the audit.
* `ai` (Claude): formalizes the question text as a predicate `P v` *without seeing the answer key*; options are instantiated into `P`.

**Trust gates:** AI fragments are linted (no `sorry`, `axiom`, `#eval`, `native_decide`, meta-programming, `set_option`, imports, new declarations); after compiling, `#print axioms` must show only `propext`, `Classical.choice`, `Quot.sound`. Proof search: a tactic cascade, then optional AI proof repair whose output is linted and kernel-checked.

**Consistency audit** (stored separately from proof success): deterministic checks for Lean junk values (division by an expression that can be 0, `Real.sqrt`/`Real.log` domains, truncated ℕ subtraction, floor division, rounding, unjustified assumptions) plus an advisory Claude audit that sees the question and theorem statements but not proofs. A refutation only counts — and only then blocks publication — when the formalization is not flagged.

**Statuses:** `verified` (proofs + audit passed) · `proof_failed` (Lean rejected submitted proofs, or *refuted* the key) · `inconclusive` (proof search or audit could not finish — not evidence the answer is wrong) · `unsupported` (geometry/diagrams, rounding, no faithful formalization) · `consistency_failed` · `pending`.

**Currently supported:** exact arithmetic over ℤ/ℚ/ℝ (fractions, powers, roots, `max`/`min`, `|x|`, floor/ceiling, factorial/binomial of literals), modular arithmetic, finite sums/products with literal bounds, and — with Claude — polynomial equations, identities, inequalities, divisibility and finite combinatorial identities. **Unsupported:** geometry and diagram questions, rounded decimals, probability/modelling questions, anything that cannot be stated faithfully.

**Where it runs**
* Production: each check starts a fresh **Vercel Sandbox** microVM from a snapshot with only Lean 4.35.0 + Mathlib v4.35.0 (`yul1`), `deny-all` network, no environment variables or credentials, stopped afterwards. The Next.js function submits the job and reads the persisted result. `POST /api/admin/lean/snapshot` re-proves a smoke theorem and stores a non-expiring copy of the snapshot in `app_settings`.
* Local development: `lake env lean` under `prlimit` (24 GiB virtual, 300 s CPU), empty environment, private temp dir and `unshare --net` when available. Weaker than a microVM — dev/test only.

**Data:** `lean_verifications` (append-only history per immutable question version: eligibility, method, claim, assumptions, theorem statements, full checked file, per-theorem results and axioms, diagnostics, consistency status/findings, Lean/Mathlib/env/pipeline versions, runner, duration, attempts) and `lean_check_cache` (kernel results keyed by source hash + environment version).

**Local setup**
```bash
# 1. Lean 4.35.0 toolchain (official release archive)
curl -L -o lean.tar.zst https://github.com/leanprover/lean4/releases/download/v4.35.0/lean-4.35.0-linux.tar.zst
# extract with zstd/tar, then put its bin/ on LEAN_BIN_DIR
# 2. A Lake project outside the repo, built from lean/ (pinned lockfile)
mkdir ~/mathdle-lean && cp lean/{lean-toolchain,lakefile.toml,lake-manifest.json} ~/mathdle-lean/
cd ~/mathdle-lean && PATH=$LEAN_BIN_DIR:$PATH lake exe cache get   # ~7 GB of prebuilt Mathlib
```
Then set `LEAN_PROJECT_DIR` / `LEAN_BIN_DIR` in `.env`. `npm test` runs the Lean proof-of-concept suite against the real kernel (it is skipped when no Lean project is configured).

## Security model

* Browsers never touch the database. All tables have RLS enabled with **no policies** and no grants for `anon`/`authenticated`; tests assert `permission denied` for both roles.
* Answers and unpublished content never reach client bundles; the play API never returns correctness until the run ends.
* Admin: scrypt password hashes, hashed server-side sessions in httpOnly `SameSite=Strict` cookies, every admin page/API re-checks the session, mutations require same-origin `Origin`, login is rate-limited.
* Rate limits (Postgres-backed, shared across instances): game actions, identity creation, nickname changes, shares, logins, generation batches.
* AI and validator credentials are server-only. AI-authored SymPy is evaluated in a separate process with an AST allow-list, no builtins and time limits.
* Security headers (`nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`).

---

## Testing

```bash
npm run test:py          # validator unit tests (17)
npm test                 # Vitest: unit + integration against real Postgres (uses TEST_DATABASE_URL, reset each run)
npm run check:procedural # every procedural template × difficulty through the full validator
npm run test:e2e         # Playwright (mobile, 360px phone, desktop admin); uses its own mathdle_e2e database and port 3100
npm run typecheck && npm run lint
```

Test databases are reset; the scripts refuse to reset a URL without `test`/`e2e` in it.

---

## Deployment (Supabase + Vercel)

1. **Supabase**: create a project. Apply migrations either with the Supabase CLI (`supabase link && supabase db push` — files are in `supabase/migrations`) or with `DATABASE_URL=<connection string> npm run db:migrate`. Then `npm run db:seed` and `npm run admin:create`.
   Use the pooled connection string (transaction mode is supported: prepared statements are disabled).
2. **Validator**: Vercel’s Node runtime cannot spawn Python. Deploy `validator/` as a small service anywhere that runs Python (Fly.io, Render, Railway, Cloud Run):
   `pip install -r requirements.txt && VALIDATOR_TOKEN=... python3 server.py` (listens on `$PORT`). Set `VALIDATOR_URL` and `VALIDATOR_TOKEN` in Vercel. `GET /health` for checks.
3. **Vercel**: import the repo, set the environment variables above (Production + Preview), deploy. `vercel.json` registers the two cron runs; set `CRON_SECRET`.
4. Verify `GET /api/health` returns `{ ok: true }`, sign in at `/admin`, generate, review, compose and approve the next 7+ days.

---

### Current production setup

| Piece | Where |
|---|---|
| Player game + admin | Vercel project `mathdle` → https://mathdle-ten.vercel.app (admin at `/admin`) |
| SymPy validator | Vercel project `mathdle-validator` (Python functions in `validator/api/`, root directory `validator`) → https://mathdle-validator.vercel.app/api |
| Database | Supabase project `Mathdle` (`nsgadwlgzeawyljxmuxo`, ca-central-1), migrations 0001–0003 applied |
| App DB role | `mathdle_app` (login, BYPASSRLS, DML only — not the Supabase master role), via the `aws-1-ca-central-1` transaction pooler |
| Deployment protection | Vercel Authentication on **preview** deployments only; production domains are public |
| Production branch | the repository default branch (pushes deploy automatically) |

Secrets (`DATABASE_URL`, `APP_SECRET`, `CRON_SECRET`, `VALIDATOR_TOKEN`) are stored as *sensitive* Vercel environment variables. To rotate the DB password: `alter role mathdle_app password '...'` in the Supabase SQL editor, then update `DATABASE_URL` in Vercel and redeploy.

## Operations runbook

* **Missing challenge alert** — compose and approve today’s set in `/admin/composer/<date>`, then “Run daily job now” on the dashboard (or just load `/`).
* **An incorrect published question** — `/admin/published` → choose the date → *Void question* with a reason. This marks the slot withdrawn (players see a notice), retires the question, credits +1 to every finished run eliminated by it (recorded in `score_corrections`), and counts the slot as correct for runs still in progress. Everything is in `/admin/audit`.
* **Manual score correction** — `/admin/published` → run id, delta, reason (audited).
* **Bad generator version** — activate the previous calibrated version from the bucket page; versions are never edited in place.

---

## Known limitations

* **Identity and one-attempt enforcement are best-effort.** Clearing cookies, private windows or another device create a new anonymous identity and a new attempt. The leaderboard is casual, not high-stakes; solutions are public as soon as a run ends, so answers can be shared socially. There is no strong anti-cheat.
* The `procedural` provider is a development adapter: useful for exercising the pipeline, not a substitute for AI-authored, editor-calibrated content.
* Diagram labels are rendered as plain text (simple TeX symbols are mapped); full TeX labels inside diagrams are not supported.
* Rate limiting is per fixed window in Postgres; adequate for abuse control, not DDoS protection.

### Validator caveats worth knowing

* SymPy `solveset` over an interval can silently drop solutions of trigonometric equations; the AI prompt forbids that route (solve the polynomial in `sin x`/`cos x` and build angles explicitly), and the procedural templates follow the same rule.
* Very large radical expressions can make symbolic simplification slow; a numeric fast path rejects clearly different values first, and per-expression time limits apply.
* The diagram checker verifies lengths, angles, right-angle marks, concyclicity and plotted functions, but not tangency or parallel marks.

Screenshots of the player and admin interfaces are in [`screenshots/`](screenshots/).
