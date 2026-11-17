#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (local sessions are left alone).
# Installs what the Stop hook's test gate needs: node_modules, the validator's
# Python packages, and a local Postgres with the two test databases. Nothing
# here fails the session: a planning or review run needs none of it.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null 2>&1 || echo "setup: npm ci failed" >&2
python3 -c "import sympy, lark" 2>/dev/null || pip install -q -r validator/requirements.txt >/dev/null 2>&1 || echo "setup: pip install failed" >&2
scripts/local-postgres.sh || echo "setup: local Postgres failed; npm test will not run here" >&2
echo "setup: gate = $(node -e 'console.log(require("./.claude/pipeline.json").gate_commands.join(" && "))')"
