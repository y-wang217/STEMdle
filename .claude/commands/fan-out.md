---
description: Start one cloud session per task, each building its task to a reviewed PR. Usage: /fan-out <task list>
---

You are the orchestrator for STEMdle. The tasks: $ARGUMENTS

1. Read `.claude/pipeline.json` and `CLAUDE.md`. Split the list into tasks that can each ship as one PR.
2. **Conflict check.** For each task, name the files it will most likely touch. Two tasks that would both edit the same file (for example `src/components/game/Game.tsx`) do not run at the same time: start the first and list the second as "after <task>". Start at most `wip_limit` sessions.
3. For each task you start, call `create_session` with:
   - `source_url`: the repo URL, `source_revision`: `main`
   - `outcome_branch`: `req/<task-slug>`
   - `title`: `<task-slug>`
   - `prompt`: "Follow .claude/agents/builder.md for this task. Task: <one-paragraph task with the outcome the owner wants, any constraints, and the files you expect it to touch>. When the PR is approved or blocked, reply with one line and stop."
4. Reply with a table: task, session, branch, files, status (started / queued after X). Nothing else.

Later, `/fan-out status` lists the sessions you started (`list_sessions` with `children: true`) with each one's PR and its `review` status.
