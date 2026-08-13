#!/usr/bin/env bash
#
# graph-ecosystem.sh — one knowledge graph across every TrustShell/HyperDAG repo.
#
#   npm run graph:ecosystem
#
# A per-repo graph answers "what calls this in trustshell". This answers "where
# does RepID actually get computed", which is the question that keeps costing
# time, because the answer spans repos: HAL classifies in repid-engine, the
# score surfaces in trustrepid, the proof is verified in
# hyperdag-proof-verifier, and the harness that packages all three is
# trustshell. Nobody holds that map in their head.
#
# Read-only. Clones are shallow and land under /workspace/dealappseo/.
# Re-runnable: an existing clone is fetched, not re-cloned.
#
# The output is deliberately NOT committed — see .gitignore. A checked-in index
# goes stale against eight repos instead of one, and answers confidently anyway.

set -uo pipefail

ROOT="${ECOSYSTEM_ROOT:-/workspace/dealappseo}"
OUT="${ECOSYSTEM_OUT:-$ROOT/ECOSYSTEM-graph.json}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# trinity-ecosystem is this repo; the rest are cloned. trusttrader, trustkeys,
# trustchat-* and trustmarket are PRIVATE and need credentials, so they are not
# listed — add them here once the session can read them.
REPOS=(
  trustshell
  hyperdag-protocol
  HyperDAG-core
  hyperdag-proof-verifier
  trustrepid
  example-agent
  trustrails-dev
  repid-engine
)

command -v graphify >/dev/null 2>&1 || {
  echo "graphify not installed — run: npm run setup:context" >&2; exit 1; }

mkdir -p "$ROOT"
GRAPHS=()

# This repo first, so its graph leads the merge.
( cd "$HERE" && graphify update . >/dev/null 2>&1 )
[ -f "$HERE/graphify-out/graph.json" ] && GRAPHS+=("$HERE/graphify-out/graph.json")

for r in "${REPOS[@]}"; do
  d="$ROOT/$r"
  if [ -d "$d/.git" ]; then
    git -C "$d" fetch --quiet --depth 1 origin 2>/dev/null || true
  else
    # GIT_LFS_SKIP_SMUDGE is load-bearing: the anonymous read lane does not
    # serve LFS objects, and an unprefixed clone aborts at the smudge filter.
    GIT_LFS_SKIP_SMUDGE=1 git clone --quiet --depth 1 \
      "https://github.com/dealappseo/$r" "$d" 2>/dev/null || {
        echo "  skip $r (clone failed — private, or no access)"; continue; }
  fi
  ( cd "$d" && timeout 300 graphify update . >/dev/null 2>&1 )
  if [ -f "$d/graphify-out/graph.json" ]; then
    GRAPHS+=("$d/graphify-out/graph.json")
    printf '  %-26s ok\n' "$r"
  else
    printf '  %-26s NO GRAPH (not counted)\n' "$r"
  fi
done

# Say what was skipped. A merge that silently covers six of eight repos and
# reports a big number reads as complete coverage when it is not.
echo
echo "merging ${#GRAPHS[@]} graph(s) of $(( ${#REPOS[@]} + 1 )) repos"
[ "${#GRAPHS[@]}" -lt 2 ] && { echo "nothing to merge" >&2; exit 1; }

graphify merge-graphs "${GRAPHS[@]}" --out "$OUT"

cat <<DONE

Query it:
  graphify explain "RepIDCalculator" --graph $OUT
  graphify path "HALClassifier" "x402" --graph $OUT
DONE
