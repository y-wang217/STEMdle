#!/usr/bin/env node
// Stop / SubagentStop hook (ported from ap-academy-landing): refuse to let
// Claude finish while the gate is red. Runs only when there are code changes
// against the default branch, so planning and review runs are never blocked.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = JSON.parse(readFileSync(join(root, ".claude", "pipeline.json"), "utf8"));

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}

const sh = (cmd) => execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf8", shell: true });

function changedFiles() {
  const files = new Set();
  const add = (out) => out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((f) => files.add(f));
  // Fall back to "uncommitted only" when the default branch is not fetched.
  try { add(sh(`git diff --name-only origin/${cfg.default_branch}...HEAD`)); } catch {}
  try { add(sh("git diff --name-only HEAD")); } catch {}
  try { add(sh("git ls-files --others --exclude-standard")); } catch {}
  return [...files].filter((f) => !cfg.gate_ignore_paths.some((p) => f.startsWith(p)));
}

// Escape hatch for the Blocked procedure in .claude/agents/builder.md. Gitignored.
if (existsSync(join(root, ".claude", "state", "blocked"))) process.exit(0);

const code = changedFiles();
if (code.length === 0) process.exit(0);

// The suites need the local Postgres; start it if this session has not.
if (existsSync(join(root, "scripts", "local-postgres.sh"))) { try { sh("scripts/local-postgres.sh"); } catch {} }

const failures = [];
for (const cmd of cfg.gate_commands) {
  try { sh(cmd); }
  catch (e) {
    const out = `${e.stdout || ""}\n${e.stderr || ""}`.trim().split(/\r?\n/).slice(-40).join("\n");
    failures.push(`$ ${cmd}\n${out}`);
  }
}

if (failures.length === 0) process.exit(0);

const prefix = input.stop_hook_active
  ? "The gate is STILL failing. If you cannot fix it this turn, follow the Blocked procedure in .claude/agents/builder.md and then stop.\n\n"
  : "";
console.log(JSON.stringify({
  decision: "block",
  reason: `${prefix}Test gate failed. You may not finish until these pass:\n\n${failures.join("\n\n")}`,
}));
process.exit(0);
