---
name: dev-pipeline
description: Install or check the owner's standard agent development pipeline in a code repository — CI gate, an independent Claude reviewer, auto-merge vs human-merge lanes, guard and test-gate hooks, builder/reviewer agents and a /fan-out command that starts one cloud session per task — modelled on y-wang217/ap-academy-landing. Use whenever a session starts work in a repository that has no `.claude/pipeline.json`, when the user starts a new project or repo, or when they ask to "set up the pipeline", "make it like ap-academy" or "like STEMdle", "add CI and auto-merge", "let Claude ship PRs without me", or "run tasks in parallel sessions". Also use to audit a repo that already has the pipeline. Do NOT use for one-off scripts, notebooks or non-code work.
---

# Dev pipeline kit

The owner's standard for every code project: tasks run as parallel Claude sessions, each ships a PR, CI and an independent Claude reviewer check it, and it merges on its own unless it touches something risky. The owner hears from the pipeline only when the next move is theirs.

Reference implementations: `y-wang217/stemdle` (this kit's source, under `tools/dev-pipeline-skill/`) and `y-wang217/ap-academy-landing` (the full version with a Notion board, design approver and routines). When a template here and those repos disagree, the repos win; read them with `add_repo` if needed.

## What gets installed

| template | goes to |
|---|---|
| `templates/pipeline.json` | `.claude/pipeline.json` |
| `templates/settings.json` | `.claude/settings.json` |
| `templates/hooks/guard.mjs`, `test-gate.mjs`, `session-start.sh` | `.claude/hooks/` (chmod +x) |
| `templates/agents/builder.md`, `reviewer.md` | `.claude/agents/` |
| `templates/commands/fan-out.md` | `.claude/commands/` |
| `templates/workflows/ci.yml`, `claude-review.yml`, `claude.yml` | `.github/workflows/` |
| `templates/workflows/dependabot.yml` | `.github/dependabot.yml` |
| `templates/docs/design-template.md` | `docs/designs/_TEMPLATE.md` |
| `templates/docs/PIPELINE.md` | `PIPELINE.md` (owner setup checklist) |

## Steps

1. **Check first.** If `.claude/pipeline.json` exists, audit instead: compare each installed file with its template and report drift, and confirm the `gate_commands` pass. Change nothing without saying what and why.
2. **Read the project.** Package manager and scripts (`package.json`, `pyproject.toml`, ...), test runners, whether tests need a database or Python, migrations folder, auth/payment/scoring code, and any `CLAUDE.md`/`AGENTS.md`.
3. **Fill `pipeline.json`.** `repo`, `owner_login` (`y-wang217` unless the repo says otherwise), `gate_commands` (typecheck, lint, fast tests; the whole set should finish in about 2 minutes), `e2e_paths`, and `human_merge_paths`: always the defaults in the template plus the project's migrations, auth, payments, scoring and any correctness core. Remove every `REPLACE` entry.
4. **Fill `ci.yml`.** `gate` runs every gate command plus the build; add a Postgres service or Python setup when the tests need them. Keep the job names `gate` and `e2e`: `claude-review.yml` and branch protection depend on them. Write the workflows **before** `settings.json`, because once the guard hook is active it blocks edits to `.github/workflows/`.
5. **Copy the rest**, then write `settings.json` last. If the tests need a local database, add a `scripts/local-postgres.sh` (see stemdle's) and the session-start hook will start it.
6. **CLAUDE.md.** Add an `## Agent pipeline` section (copy stemdle's, adjusted) and a `## Rules` section naming what must never be weakened (the reviewer and builder treat those rules as blocking). If the repo has an `AGENTS.md`, import it with `@AGENTS.md`.
7. **Verify, and say what passed.**
   - `node <skill>/scripts/check-guard.mjs .claude/hooks/guard.mjs` → every line `ok`.
   - `echo '{}' | CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/test-gate.mjs` → no output means the gate passed; fix the project or the commands until it does.
   - Parse every YAML file.
8. **Commit** on the session's branch with a message listing what was installed, push, and give the owner the unticked steps of `PIPELINE.md` (default branch `main`, the `CLAUDE_CODE_OAUTH_TOKEN` secret, auto-merge setting, ruleset requiring `gate`, `e2e`, `review`). Only the owner can do these; never claim they are done.

## Rules for every repo
- Nothing is pushed to `main` directly; every change is a PR.
- The reviewer is a separate run that did not write the code, and it judges the PR against `docs/designs/<slug>.md`.
- Auto-merge only for approved PRs outside `human_merge_paths`.
- An agent never edits hooks, settings, `pipeline.json` or workflows once installed. It writes a patch block in `docs/spec/<name>-patches.md`, and the PR is merged by a human.
- Not part of the base kit, add when asked: a Notion **Dev Requirements: <repo>** board with designer, approver, sweep and kick routines, plus the pipeline doctor, retro and ops window from ap-academy-landing.
