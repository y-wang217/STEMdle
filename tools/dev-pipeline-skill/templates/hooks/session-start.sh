#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (local sessions are left alone).
# Installs what the Stop hook's test gate needs. Nothing here fails the
# session: a planning or review run needs none of it. Add project-specific
# steps (Python packages, a local database) at the end.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile >/dev/null 2>&1 || echo "setup: pnpm install failed" >&2
elif [ -f package-lock.json ] && [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || echo "setup: npm ci failed" >&2
fi
[ -x scripts/local-postgres.sh ] && { scripts/local-postgres.sh || echo "setup: local Postgres failed" >&2; }

echo "setup: gate = $(node -e 'console.log(require("./.claude/pipeline.json").gate_commands.join(" && "))')"
