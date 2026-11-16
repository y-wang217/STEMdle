# Graphify (code graph) — developer tooling

[Graphify](https://github.com/Graphify-Labs/graphify) (MIT, PyPI `graphifyy`) builds a queryable
dependency graph of this repo for Claude Code. Here it runs **locally, AST-only** (tree-sitter):
no API key, no LLM calls, nothing in the app bundle or on Vercel. Output goes to `graphify-out/`
(gitignored).

## Setup and rebuild

```bash
sh scripts/graph.sh            # installs graphifyy[sql]==0.9.111 via uv/pipx if missing,
                               # full build if no graph, incremental update if stale, else no-op
sh scripts/graph.sh --check    # exit 0 fresh / 1 stale or missing; builds nothing
sh scripts/graph.sh --force    # full rebuild
```

Needs Python 3.11+ and [uv](https://docs.astral.sh/uv/) or pipx. Manual install: `uv tool install 'graphifyy[sql]==0.9.111'`
(the `[sql]` extra is required to index `supabase/migrations`). Full build ≈ 4 s, incremental ≈ 3 s on this repo. Indexed: `.ts/.tsx/.py/.sql` and config
JSON/YAML. Exclusions: `.gitignore` plus `.graphifyignore` (lock files, assets, `.claude/`, secrets).

**Staleness.** The script records `HEAD` in `graphify-out/.stemdle_head` after each sync and treats the
graph as stale if `HEAD` moved, any indexed source is newer than that stamp, or source files were
deleted. `graphify-out/GRAPH_REPORT.md` also prints the commit it was built from.

## Queries

| Need | Command |
|---|---|
| Callers/callees of a symbol, with file:line | `graphify explain "submitAnswer()"` (`--all` for every edge) |
| Blast radius of a change | `graphify affected "src/lib/game/engine.ts::finalize()" --depth 2` |
| Dependency path | `graphify path "todayChallenge()" "activateDate()"` (directed) |
| Hubs | `graphify god-nodes --top 15` |
| Orientation only | `graphify query "<words>" --budget 1500` (keyword BFS; noisy) |
| Visual browse | open `graphify-out/graph.html` |

Ambiguous names exit 3 and list candidates: retry with `path/to/file.ts::name()`. No match exits 4.
See `docs/ARCHITECTURE.md` for a 10-question playbook.

## How it complements other tools

- Graph first for **where** and **who depends on what** across files; then read the source at those lines.
- `grep` for literals, URLs, SQL table names and conventions, which the graph does not model.
- Tests and typecheck remain the authority on behaviour.

## Validation results (commit `f10af32`)

| Test | Graph found correctly | Missed / wrong | Ordinary exploration needed for |
|---|---|---|---|
| A: question → screen | `executeBatch`→`insertQuestion`/`validateVersions`/`enqueueLean`; `todayChallenge`→`activateDate`; `getState`→`questionForSlot`; routes→engine; `Game`→`QuestionView`→`Tex`/`Diagram`; all edges matched source | No edge from `Game.tsx` `fetch` to the API routes; nothing links composer approval to the SQL trigger | The client/server hop and the publication rule |
| B: answer → state | `submitAnswer` callees (`getRun`, `questionForSlot`, `finalize`, `track`) and its only caller (`/api/game/answer`) exactly; `affected` gave the route + test | `affected` stops at the route (no `Game.tsx`); correctness is a column (`is_correct`), not a node; void-counts-as-correct rule only visible in source | Reading `engine.ts:98-125`, `Game.tsx` `pick` |
| C: new category | `affected GeneratorProfile` listed 14 importers; `templatesBySlot` found | None of the 30+ hard-coded `8`s, the SQL `CHECK`s, the publication trigger count, or prompt text | One `grep` found all of them |

Also observed: `affected "splitMath()"` correctly showed TeX parsing shared by rendering and
validation; `affected "DiagramSpecT"` listed every question-format UI consumer; two distinct
`PublicQuestion` nodes exposed a duplicated wire type. Undirected `path` produced a false link
through `HttpError`. Free-text `query` matched "add"/"new" to unrelated symbols.

No timing or token benchmark was run, so this doc makes no efficiency claims.

## Known limitations

- No edges across HTTP `fetch`, child-process/HTTP calls to Python, or SQL in TS template strings.
- SQL triggers/functions are nodes, but nothing links them to the TS that fires them.
  Two migrations (`_rls.sql`, `_function_search_path.sql`) yield no symbols.
- Communities are unnamed (`Community N`). Naming needs an LLM backend and is deliberately off.
- Docs (`README.md`) are not indexed in code-only mode. Indexing them needs the `/graphify` skill or `--backend`, which spend LLM tokens.
- Symbols must be named exactly (`voidPublishedQuestion()`, not `voidQuestion()`).

## Optional extras (not enabled)

- `graphify hook install`: git post-commit/checkout hooks that rebuild in the background (per clone, under `.git/hooks`).
- `graphify claude install`: adds PreToolUse hooks that run on **every** Bash/Grep/Read/Glob call (~120 ms each here) and a stricter CLAUDE.md rule. Not used: it taxes every interaction, including trivial ones.
- `graphify install`: adds the `/graphify` skill to `~/.claude/skills` (full multimodal pipeline, uses LLM tokens).

## Disable or uninstall

- Disable for Claude: delete the "Graphify" section of `CLAUDE.md`.
- Remove project files: `rm -rf graphify-out .graphifyignore scripts/graph.sh docs/GRAPHIFY.md`, then drop the `/graphify-out/` line from `.gitignore`.
- Remove the CLI: `uv tool uninstall graphifyy` (or `pipx uninstall graphifyy`). If you ran the optional extras: `graphify hook uninstall`, `graphify claude uninstall`, `graphify uninstall`.
