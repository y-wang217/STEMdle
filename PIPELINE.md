# Pipeline setup checklist (owner steps)

Steps Claude Code cannot do from a session. Do them once, in order. Modelled on `y-wang217/ap-academy-landing/PIPELINE.md`.

## 1. A real `main` branch
The repository has no `main` today: its default branch is `claude/dreamy-noether-dp0csr`.
- [ ] Create `main` from `claude/dreamy-noether-dp0csr` and make it the default branch (Settings → General → Default branch).
- [ ] Decide on the two unmerged branches: `claude/gallant-sagan-jz8j40` (auto-activate learned generator versions, per-slot diagram policy) and `claude/determined-noether-vmv70d` (Graphify code graph). Open a PR for each into `main`, or delete them.

## 2. GitHub settings
- [ ] Secret `CLAUDE_CODE_OAUTH_TOKEN`: the output of `claude setup-token` (Settings → Secrets and variables → Actions). The reviewer and `@claude` workflows use it.
- [ ] Claude GitHub App installed on the repository with Contents, Pull requests, Issues and Actions write.
- [ ] Settings → General → Pull Requests: tick **Allow auto-merge** and **Automatically delete head branches**.
- [ ] Settings → Actions → General → Workflow permissions: **Read and write permissions**.
- [ ] Ruleset on `main` (Settings → Rules → Rulesets → New branch ruleset, target the default branch):
  - Require a pull request before merging (0 required approvals: the bot's `review` status is the second pair of eyes).
  - Require status checks to pass: `gate`, `e2e`, `review`. `review` is a commit status posted by `claude-review.yml`; it appears in the picker after the first PR has run through it.
  - Block force pushes. Leave yourself as a bypass actor if you want to hotfix.
- [ ] Settings → Advanced Security: Dependabot alerts and security updates on.

## 3. Check it works
- [ ] Open a throwaway PR that changes one line of copy. Expected: `gate` and `e2e` go green, then **Claude Reviewer** runs, posts one comment ending in `pipeline-review verdict=approve`, sets `review` to success, and the PR auto-merges.
- [ ] Open a throwaway PR that touches `supabase/migrations/`. Expected: same review, plus the `needs-human-merge` label and one "your move" comment mentioning you. It does not auto-merge.

## How it runs once set up
| when | what happens | who |
|---|---|---|
| you give a list of tasks | `/fan-out` starts one cloud session per task (at most `wip_limit`, no two on the same file) | orchestrator session |
| a session builds | design note → tests first → code → gate green (Stop hook enforces) → PR → subscribed to its PR | builder session |
| CI finishes green | the reviewer posts a verdict and the `review` status | `claude-review.yml` |
| verdict = changes | the builder session gets the comment as a PR event, fixes, pushes; CI re-runs the review | builder session |
| changes requested 3 times | one comment mentions you | `claude-review.yml` |
| verdict = approve, normal paths | auto-merge (squash), branch deleted | `claude-review.yml` + GitHub |
| verdict = approve, human-merge paths | label + one "your move: merge" comment | you |

You hear from the pipeline only when the next move is yours.

## Editing the pipeline itself
The guard hook blocks agents from editing hooks, settings, `pipeline.json` and workflows. A session that needs such a change writes the complete new file in `docs/spec/<name>-patches.md` and the PR is human-merged; apply the patch through the GitHub web editor on the PR branch.

## Not ported yet (ap-academy-landing has these)
Notion **Dev Requirements** board with designer, design approver, sweep and kick routines; pipeline doctor, retro, ops window. Add them when the backlog outgrows a task list in chat.
