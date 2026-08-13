#!/usr/bin/env bash
#
# setup-context-tools.sh — install the two context/memory tools this repo uses.
#
#   Graphify  — builds a queryable knowledge graph of the codebase so an agent
#               can ask "what calls this" instead of grepping. Local AST
#               parsing, no LLM calls, deterministic.
#   Headroom  — compresses oversized payloads before they reach the model.
#
# Both are dev tooling: nothing here ships to production and nothing here is
# imported by the app. Safe to re-run; every step is idempotent.
#
# Why both, and why the split matters — measured on a real session's
# transcripts with `headroom audit-reads`, not taken from either README:
#
#   MCP JSON tool results   ~48% of all tool bytes   <- Headroom's territory
#   Bash output             ~38%
#   Read (file contents)     ~5%                     <- Graphify's territory
#
# The intuition that file reads dominate an agent's context is wrong for this
# workload by roughly an order of magnitude. Structured tool output is the
# cost. See docs/CONTEXT-BUDGET.md for the full measurement and its caveats.

set -euo pipefail

echo "==> Graphify"
if ! command -v uv >/dev/null 2>&1; then
  echo "    uv not found. Install it first: https://docs.astral.sh/uv/" >&2
  exit 1
fi
# The [sql] extra matters here: without tree-sitter-sql every file under
# supabase/migrations/ contributes nothing, and the schema is a large part of
# what makes this codebase legible. graphify warns about it but exits 0, so
# the omission is easy to miss.
uv tool install --force "graphifyy[sql]"
graphify install --platform claude

echo "==> Headroom"
python3 -m pip install --quiet --upgrade "headroom-ai"
# Content-type detection (magika) needs an ONNX runtime. Without it Headroom
# logs a warning, falls back to a coarser tier, and still reports success —
# so install it explicitly rather than relying on the fallback.
python3 -m pip install --quiet onnxruntime

echo "==> Build the graph (no LLM, no network)"
graphify update .

cat <<'DONE'

Installed.

  npm run graph        rebuild the knowledge graph after code changes
  npm run mem:audit    re-measure where context is actually going

Graph output lands in graphify-out/ and is gitignored on purpose — a committed
index goes stale against the code it describes and answers confidently anyway.

To route an agent's traffic through Headroom's compressing proxy, run
`headroom init claude` on your own machine. Do NOT run it inside a live agent
session: it rewrites provider routing for the running process.
DONE
