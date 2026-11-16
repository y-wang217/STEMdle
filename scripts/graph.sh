#!/usr/bin/env sh
# Keep the local Graphify code graph (graphify-out/, gitignored) present and fresh.
# Dev tooling only: nothing here is imported by the app or shipped to Vercel.
#
#   sh scripts/graph.sh           build if missing, incremental update if stale, else no-op
#   sh scripts/graph.sh --check   report fresh/stale only (exit 0 fresh, 1 stale/missing)
#   sh scripts/graph.sh --force   full rebuild
#
# Extraction is local tree-sitter AST only (--code-only): no API key, no LLM, no network
# after install. See docs/GRAPHIFY.md.
set -eu

GRAPHIFY_SPEC='graphifyy[sql]==0.9.111'
OUT=graphify-out
GRAPH="$OUT/graph.json"
HEAD_FILE="$OUT/.stemdle_head"
SRC_DIRS="src validator scripts supabase tests"

cd "$(git rev-parse --show-toplevel)"
mode="${1:-}"

ensure_cli() {
  command -v graphify >/dev/null 2>&1 && return 0
  [ "$mode" = "--check" ] && { echo "graphify: not installed"; exit 1; }
  echo "graphify: installing $GRAPHIFY_SPEC" >&2
  if command -v uv >/dev/null 2>&1; then uv tool install "$GRAPHIFY_SPEC" >&2
  elif command -v pipx >/dev/null 2>&1; then pipx install "$GRAPHIFY_SPEC" >&2
  else echo "graphify: install uv or pipx first (see docs/GRAPHIFY.md)" >&2; exit 1
  fi
  export PATH="$HOME/.local/bin:$PATH"
}

stale_reason() {
  [ -f "$GRAPH" ] || { echo "no graph"; return; }
  head_now=$(git rev-parse HEAD)
  [ "$(cat "$HEAD_FILE" 2>/dev/null)" = "$head_now" ] || { echo "HEAD moved since last build"; return; }
  # Compare against the stamp written after each successful sync, not graph.json:
  # graphify skips rewriting graph.json when nothing structural changed.
  # shellcheck disable=SC2086
  newer=$(find $SRC_DIRS -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' -o -name '*.sql' \) \
            -newer "$HEAD_FILE" -print 2>/dev/null | head -1)
  [ -z "$newer" ] || { echo "source changed: $newer"; return; }
  git status --porcelain -- $SRC_DIRS | grep -q '^ \?D' && { echo "source files deleted"; return; }
  echo ""
}

ensure_cli
reason=$(stale_reason)

if [ "$mode" = "--check" ]; then
  if [ -z "$reason" ]; then echo "graphify: fresh ($(cat "$HEAD_FILE" | cut -c1-8))"; exit 0; fi
  echo "graphify: stale - $reason"; exit 1
fi

if [ "$mode" = "--force" ] || [ ! -f "$GRAPH" ]; then
  echo "graphify: full build" >&2
  graphify extract . --code-only --force >&2
  graphify cluster-only . --no-label >&2   # writes GRAPH_REPORT.md + graph.html; --no-label = no LLM
elif [ -n "$reason" ]; then
  echo "graphify: updating ($reason)" >&2
  graphify update . --force >&2           # incremental AST re-extract; --force allows node removal after deletes
else
  echo "graphify: fresh" >&2
  exit 0
fi
git rev-parse HEAD > "$HEAD_FILE"
echo "graphify: ready - $GRAPH" >&2
