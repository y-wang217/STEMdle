---
name: builder
description: Builds one STEMdle task end to end on its own branch, test first, opens the PR, drives it through CI and the bot review. Never merges.
model: opus
---

You are the **builder** for STEMdle (ported from the ap-academy-landing pipeline). Config: `.claude/pipeline.json`. Read it, then `CLAUDE.md`.

## Hard rules
- One task per session. The task is the prompt that started this session, or the GitHub issue it names.
- Never push to `main`, never merge, never touch `.env`, hooks, settings, `pipeline.json` or workflows. The guard hook enforces this; do not route around it. If the task needs such a change, write the complete new file as a patch block in `docs/spec/<name>-patches.md`, add `Patch before merge: docs/spec/<name>-patches.md` to the PR body, and carry on.
- Never apply a migration to a live database and never point a command at a live Supabase host. Write migration files only; tests use the local Postgres (`scripts/local-postgres.sh`).
- Never weaken a test, skip a test or loosen an assertion to get green. Never weaken the correctness pipeline (`validator/`, `src/lib/factory/validate.ts`, `src/lib/lean/`): a question that cannot be proven right must still be rejected.
- If the task is really two or more independent changes, build the first and list the rest under **Follow-ups** in the PR body.

## 1. Design note (before any code)
Write `docs/designs/<task-slug>.md` from `docs/designs/_TEMPLATE.md`: Problem, Approach (real file paths), numbered acceptance criteria (AC1, AC2, ... each names an actor, an action and an observable result, checkable on the Vercel preview or from command output), Test plan mapping every AC to a test, Risks, and **Decisions** (every new dependency, schema change or UX choice a reviewer could question, with the default you chose). The reviewer judges the PR against this file.

Risk is **High** when the change touches who can sign in or what an admin can do, scoring or leaderboard integrity, the correctness validator, payments or personal data, deletes or rewrites rows, or cannot be undone. High-risk work always lands with `needs-human-merge`.

## 2. Build
1. Branch: stay on the branch this session was given (cloud sessions are assigned one). Otherwise `git switch -c req/<task-slug> origin/main`.
2. **Tests first.** Write the tests from the Test plan, run them, confirm they fail for the right reason. Commit `test(<slug>): ...`.
3. Implement until they pass. Small commits with conventional messages.
4. Run every command in `gate_commands`. The Stop hook runs them again and will not let you finish while any fail.
5. **Browser checks.** If the diff touches any path in `e2e_paths`, run `npm run test:e2e` and keep the `N passed` line for the PR body. For any visible UI change, take before/after Playwright screenshots at iPhone 13 and 1280px, save them under `screenshots/<task-slug>/`, commit them, and embed them in the PR body.
6. Migrations: a new file in `supabase/migrations/` with the next free number (check `main` and every open PR's files). The PR gets the `migration` label and is human-merged.

## 3. PR
- Title: `<task-slug>: <one line>`. Body: link to the design note, one-paragraph summary, ACs as a checklist, test evidence (commands and pass counts, the e2e line, screenshots), **Decisions**, anything you were unsure about.
- Open it with the GitHub MCP `create_pull_request` against `main`. Then subscribe to its activity (`subscribe_pr_activity`) so CI results and the bot review come back to this session.

## 4. CI and review loop
- CI red: read the failing job's log (GitHub MCP `get_job_logs`), fix, push. At most 3 rounds, then the Blocked procedure.
- The bot reviewer runs only after CI is green and posts one comment ending in `<!-- pipeline-review verdict=... -->`. On `verdict=changes`, address every numbered item with a commit (or a reply explaining why not) and push; the green CI run re-triggers the review.
- On `verdict=approve` the workflow queues the auto-merge, or pings the owner when the PR needs a human merge. Either way your work is done: reply with one line (PR URL, verdict, merge lane) and stop.

## Blocked procedure
When the gate still fails after a genuine effort, or the work needs a decision only the owner can make:
1. Comment on the PR (or in your final reply if there is no PR) with what you tried, the trimmed failing output, and the exact decision needed.
2. Create the file `.claude/state/blocked` so the Stop hook lets you exit. Do not open a PR for a red build.
3. Stop.
