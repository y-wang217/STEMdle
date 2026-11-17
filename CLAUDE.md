# STEMdle

A daily eight-question STEM game for Grade 11–12 students (the code and README still say Mathdle), and the question factory behind it. It is part of AP Academy's system: questions should match what Ontario STEM students need (MCR3U, MHF4U, MCV4U, SPH3U/4U, SCH3U/4U).

@AGENTS.md

**Next.js 16 has breaking changes.** Read the relevant guide in `node_modules/next/dist/docs/` before writing routing, data or config code.

## Layout
| path | what |
|---|---|
| `src/app/` | player game (`/`), admin factory UI (`/admin`), API routes (`/api/game/*`, `/api/admin/*`, `/api/cron/daily`) |
| `src/components/game/` | player UI: `Game.tsx`, `QuestionView.tsx`, `Results.tsx` |
| `src/lib/factory/` | generation providers (Claude, procedural), validation, feedback, learning, metrics |
| `src/lib/game/` | game engine (server-authoritative state machine), identity, leaderboard |
| `src/lib/composer.ts` | daily set assembly, approval, activation |
| `validator/` | Python + SymPy correctness validator (CLI and HTTP server) |
| `lean/`, `src/lib/lean/` | Lean 4 + Mathlib formal verification |
| `supabase/migrations/` | schema, triggers and RLS. Append-only: a new numbered file per change |
| `tests/unit`, `tests/integration` | Vitest against a real local Postgres |
| `tests/e2e` | Playwright: phone, 360px phone, desktop admin |

## Commands
```bash
scripts/local-postgres.sh   # local Postgres on :5432 with mathdle_test and mathdle_e2e (cloud sessions start it automatically)
npm run typecheck           # next typegen + tsc
npm run lint
npm run test:py             # validator unit tests
npm test                    # vitest unit + integration (~25s)
npm run check:procedural    # every procedural template through the validator (~2.5 min, CI only)
npm run test:e2e            # Playwright
```

## Agent pipeline
Ported from `y-wang217/ap-academy-landing`. Config: `.claude/pipeline.json`. Human setup: `PIPELINE.md`.

- Every change ships on its own branch (`req/<slug>` or the session's `claude/...` branch) through a PR into `main`. Nothing is pushed to `main` directly.
- A builder session follows `.claude/agents/builder.md`: design note in `docs/designs/`, tests first, gate green, PR, CI loop. `/fan-out <tasks>` starts one session per task.
- CI (`gate`, `e2e`) runs on every PR. When it is green, `.github/workflows/claude-review.yml` runs the reviewer (`.claude/agents/reviewer.md`) and posts the `review` status.
- **Two merge lanes.** Approved PRs auto-merge (squash) unless they touch `human_merge_paths` (migrations, the correctness validator, Lean, game engine and scoring, auth, CI, pipeline config, dependencies) or carry `needs-human-merge`; those wait for the owner.
- Hooks: `guard.mjs` blocks pushes to main, merges, force pushes, live databases, production deploys, reading `.env`, and edits to hooks, settings, `pipeline.json` and workflows. `test-gate.mjs` will not let a session finish with code changes while any `gate_commands` fail.
- A change to a guarded file is delivered as a complete patch block in `docs/spec/<name>-patches.md` for the owner to apply.

## Rules
- Correctness is never traded for speed: every question shown to a player passed the validator (or was explicitly math-reviewed). Never weaken `validator/`, `src/lib/factory/validate.ts` or the Lean checks to make a test pass.
- The game stays server-authoritative: the client never receives the correct option before answering.
- Mobile first. Every UI change is checked at iPhone 13 and 360px widths, with screenshots in the PR.
- Test databases are reset by the suites; the scripts refuse a URL without `test`/`e2e` in it. Never point tests or scripts at the live Supabase project.
