@AGENTS.md

# Mathdle — notes for Claude Code

What the code actually is (verify before assuming otherwise): a daily **8-slot, multiple-choice
maths** game (Next.js 16 + Postgres/Supabase + a Python/SymPy validator + async Lean 4 checks),
not a general 5-question STEM game. One wrong answer or a skip ends the scored run. Read
`README.md` for product rules and `docs/ARCHITECTURE.md` for the system map, the seams between
subsystems, and the hard-coded "8" sites.

Tests: `npm run typecheck && npm run lint`, `npm run test:py`, `npm test` (needs `TEST_DATABASE_URL`),
`npm run test:e2e`. Never change gameplay, scoring or publication rules as a side effect.

## Graphify (code graph): when and how

A local, AST-only dependency graph lives in `graphify-out/` (gitignored, ~4 s to build, no LLM/API).
It supplements reading source; it never replaces it.

**Skip it** for trivial or single-file edits (copy, styling, a local bug fix in a known file).

**Use it** for nontrivial work: cross-module changes, "what depends on X", "how does X reach Y",
impact analysis before changing a shared type, schema, or engine function.

1. `sh scripts/graph.sh` — installs the pinned CLI if missing, builds if absent, updates only if stale.
2. Locate: `graphify explain "<symbol>"` (callers/callees with file:line).
   Disambiguate with `"path/to/file.ts::symbol()"` (exit code 3 lists candidates, 4 = no match).
3. Upstream/downstream: `graphify affected "<file>::<symbol>" --depth 2` (who breaks if it changes),
   `graphify path "<A>" "<B>"` (directed). `--undirected` paths often run through utility hubs
   (`sql`, `HttpError`, `json()`, `audit()`) and then mean nothing.
4. Read the source at the reported lines before editing. Then grep for what the graph cannot see (below).
5. Implement and test. After structural changes (new/moved/deleted modules or exports),
   `sh scripts/graph.sh` again; `sh scripts/graph.sh --check` reports fresh/stale without building.

Prefer `explain`/`affected`/`path` on exact symbols. Free-text `graphify query "..."` is keyword
matching and noisy here; use it only for orientation, with `--budget`.

**The graph is blind to** (always grep / read `docs/ARCHITECTURE.md` "Seams" for these):
- client `fetch("/api/...")` → route handlers (so `affected` on engine code stops at the API route);
- TS → Python validator (`validator-client.ts` spawns `validator/cli.py` or calls `VALIDATOR_URL`);
- TS tagged-template SQL → tables, and SQL triggers that enforce publication/immutability rules;
- literals and conventions: the slot count `8` is hard-coded in 30+ places across TS, SQL and prompts;
- the duplicated `PublicQuestion` types (`src/lib/game/engine.ts` vs `src/components/game/Game.tsx`).
