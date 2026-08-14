#!/usr/bin/env bash
#
# setup-agent-browser.sh — install vercel-labs/agent-browser and point it at a
# Chrome that actually exists on this machine.
#
#   agent-browser — a native (Rust) browser-automation CLI built for agents.
#   Its selling point over raw Playwright for this use is `snapshot`: it emits
#   the accessibility tree with stable refs (@e1, @e2) that you then click and
#   fill by ref, so an agent does not have to invent CSS selectors.
#
# This is dev tooling. Nothing here ships to production, nothing here is
# imported by the app, and it is deliberately NOT in package.json — see the
# "why not a devDependency" note below. Safe to re-run; every step is
# idempotent.
#
# ── Three things that fail quietly, all measured on 2026-08-14 ───────────────
#
# 1. `npm i -g agent-browser` DOES NOT GIVE YOU THE LATEST VERSION.
#    agent-browser >= 0.28.0 declares `engines: { node: ">=24" }`. npm 10
#    silently prefers an engine-compatible version when resolving a bare
#    package name, so on this container's Node v22.22.2 the command installs
#    **0.27.0** — seven releases behind — and exits 0 with no warning at all.
#    `npm view agent-browser version` says 0.34.0 the whole time, which is how
#    you end up debugging a "missing" feature that shipped weeks ago.
#    So: pin `@latest` explicitly. 0.34.0 was smoke-tested on Node 22 here
#    (open / snapshot / fill / click / read-back all pass) — the engines field
#    over-declares, because the CLI itself is a Rust binary and the Node
#    wrapper barely does anything.
#
# 2. `agent-browser install` CANNOT RUN IN A SANDBOXED AGENT SESSION.
#    It fetches Chrome for Testing from googlechromelabs.github.io, which the
#    proxy answers with 403 to CONNECT (policy denial, not auth — do not go
#    rotate a credential over it; see CLAUDE.md § Network). This script tries
#    it anyway, because on a laptop it is the right answer, then falls back to
#    a Chrome that is already on disk.
#
# 3. `agent-browser doctor` REPORTS "No Chrome binary found" EVEN WHEN THE
#    BROWSER LAUNCHES FINE. doctor probes its own cache, system Chrome,
#    Puppeteer and Playwright dirs — but it does not read executablePath out of
#    the config file that the launcher does read. A red doctor row and a
#    working browser are entirely compatible. Trust the smoke test at the
#    bottom of this script, not doctor.
#
# ── Why not a devDependency ─────────────────────────────────────────────────
#
# The npm package is ~73 MB (it ships prebuilt binaries for every platform).
# devDependencies are installed during the Vercel and Railway builds, so adding
# it there would put 73 MB of dev tooling into both production build contexts
# to gain nothing at runtime — and this repo has already had one deploy broken
# by build-context bloat (see .gitignore, .claude/worktrees at 61.7 MB).
# Global install, out of the build, is the cheaper trade.

set -euo pipefail

CONFIG_DIR="${HOME}/.agent-browser"
CONFIG_FILE="${CONFIG_DIR}/config.json"

echo "==> agent-browser CLI"
# @latest is load-bearing, not decoration. See note 1 above.
npm install -g agent-browser@latest
echo "    installed: $(agent-browser --version)"

echo "==> Chrome"
# resolve_chrome: print a path to a usable Chrome/Chromium, or nothing.
# Ordered cheapest-first: an already-downloaded browser beats a fresh download.
resolve_chrome() {
  local candidates=()

  # Playwright's cache. PLAYWRIGHT_BROWSERS_PATH is set in Claude Code cloud
  # sessions (/opt/pw-browsers) and is the fastest hit there.
  #
  # `chrome` before `headless_shell`, and NOT one `find` with -o: that cache
  # holds both chromium-<rev>/ and chromium_headless_shell-<rev>/, and any
  # single sorted pass puts headless_shell first ('_' sorts after '-'). The
  # shell is the old headless binary — it launches and drives pages, so the
  # smoke test below passes on it and nothing looks wrong, but it cannot do
  # headed mode or extensions. Silently landing on the weaker binary is the
  # kind of unearned pass this repo keeps catching.
  if [[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d "${PLAYWRIGHT_BROWSERS_PATH}" ]]; then
    for name in chrome headless_shell; do
      while IFS= read -r p; do candidates+=("$p"); done < <(
        find "${PLAYWRIGHT_BROWSERS_PATH}" -maxdepth 3 -type f -name "$name" 2>/dev/null | sort -r
      )
    done
  fi
  if [[ -d "${HOME}/.cache/ms-playwright" ]]; then
    while IFS= read -r p; do candidates+=("$p"); done < <(
      find "${HOME}/.cache/ms-playwright" -maxdepth 4 -type f -name chrome 2>/dev/null | sort -r
    )
  fi

  # agent-browser's own cache, if `agent-browser install` ever succeeded here.
  if [[ -d "${CONFIG_DIR}/browsers" ]]; then
    while IFS= read -r p; do candidates+=("$p"); done < <(
      find "${CONFIG_DIR}/browsers" -maxdepth 4 -type f -name chrome 2>/dev/null | sort -r
    )
  fi

  # System installs, including macOS.
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then candidates+=("$(command -v "$c")"); fi
  done
  candidates+=("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

  for p in "${candidates[@]}"; do
    if [[ -x "$p" ]]; then printf '%s\n' "$p"; return 0; fi
  done
  return 1
}

# Only attempt the download when nothing is on disk yet — it is the slow path
# and, in a sandboxed session, the failing one.
if ! CHROME="$(resolve_chrome)"; then
  echo "    no Chrome on disk; trying 'agent-browser install'"
  agent-browser install || echo "    download failed (see note 2 above); continuing"
  CHROME="$(resolve_chrome || true)"
fi

if [[ -z "${CHROME:-}" ]]; then
  cat >&2 <<'NOCHROME'

    No Chrome found and none could be downloaded.

    On a laptop:      agent-browser install
    In a sandbox:     install Chrome/Chromium by other means, then re-run this
                      script — it will find it and write the config.

NOCHROME
  exit 1
fi
echo "    using: ${CHROME}"

echo "==> ${CONFIG_FILE}"
# MACHINE-LOCAL ON PURPOSE. This path is specific to one machine, so it must
# not be committed. agent-browser layers config as:
#
#   defaults -> ~/.agent-browser/config.json -> ./agent-browser.json -> env -> flags
#
# so the portable project settings live in the repo's ./agent-browser.json and
# the machine-specific bits live here. Keep executablePath OUT of the committed
# file or it will override this one on every other machine.
mkdir -p "${CONFIG_DIR}"

# --no-sandbox is required when running as root (containers, CI). Chrome's
# setuid sandbox refuses to start as uid 0 and the launch failure is opaque.
# Do NOT add it unconditionally: on a normal desktop account it disables a real
# security boundary for no benefit.
BROWSER_ARGS=""
if [[ "$(id -u)" -eq 0 ]]; then
  BROWSER_ARGS="--no-sandbox"
  echo "    running as root: adding --no-sandbox"
fi

node -e '
  const fs = require("node:fs");
  const [file, executablePath, args] = process.argv.slice(1);
  // Merge rather than overwrite: this file also holds auth-vault settings and
  // anything else the user set by hand.
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  cfg.executablePath = executablePath;
  if (args) cfg.args = args; else delete cfg.args;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
' "${CONFIG_FILE}" "${CHROME}" "${BROWSER_ARGS}"

echo "==> Smoke test"
# Run it; do not read it. doctor is not evidence (note 3), and "the install
# printed no errors" is not evidence either — this repo's recurring defect is
# a system reporting success it has not earned. The only claim worth making is
# that a real page was driven end to end, so drive one.
#
# The page is served from a temp dir over loopback so the test does not depend
# on the sandbox's outbound network policy, which denies most hosts.
SMOKE_DIR="$(mktemp -d)"
trap 'rm -rf "${SMOKE_DIR}"; kill "${SMOKE_PID:-}" 2>/dev/null || true' EXIT
cat > "${SMOKE_DIR}/index.html" <<'HTML'
<!doctype html><title>agent-browser smoke test</title>
<input id="q"><button id="go"
  onclick="document.getElementById('out').textContent='ok:'+document.getElementById('q').value">Go</button>
<p id="out">idle</p>
HTML

# Let the OS pick the port. A hardcoded one collides with whatever else is
# listening, and the collision is not an error you see: the *other* server
# answers, python's bind failure is swallowed by >/dev/null, and the browser
# happily drives someone else's 404 page. That happened on the first run of
# this script — the assertion below caught it, which is the whole point of
# asserting on page output rather than on exit codes.
SMOKE_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"

# `exec` so SMOKE_PID is python itself and not the subshell wrapping it —
# otherwise the EXIT trap kills the wrapper, python survives holding the port,
# and the next run inherits the mess.
(cd "${SMOKE_DIR}" && exec python3 -m http.server "${SMOKE_PORT}" --bind 127.0.0.1 >/dev/null 2>&1) &
SMOKE_PID=$!

# Wait for the server rather than sleeping at it.
for _ in $(seq 1 25); do
  if curl -fsS --noproxy '*' "http://127.0.0.1:${SMOKE_PORT}/" 2>/dev/null | grep -q 'agent-browser smoke test'; then
    break
  fi
  sleep 0.2
done

# One batch, one process: refs (@e1, @e2) are scoped to the snapshot that
# produced them and are NOT valid in a later invocation — a separate
# `agent-browser click @e2` gets "Unknown ref: e2". Snapshot and act together.
OUT="$(agent-browser --session ab-setup-smoke --proxy-bypass "localhost,127.0.0.1" batch \
  "open http://127.0.0.1:${SMOKE_PORT}/" \
  "snapshot -i" \
  "fill @e1 smoke" \
  "click @e2" \
  "get text #out" 2>&1 || true)"
agent-browser --session ab-setup-smoke close >/dev/null 2>&1 || true

if grep -q 'ok:smoke' <<<"${OUT}"; then
  echo "    PASS — navigated, snapshotted, filled by ref, clicked, read back"
else
  echo "    FAIL — the browser did not complete the round trip:" >&2
  printf '%s\n' "${OUT}" >&2
  exit 1
fi

cat <<DONE

Installed. Start here:

  agent-browser skills get core --full     # the CLI's own agent guide
  agent-browser open <url>
  agent-browser snapshot -i                # interactive elements, with refs
  agent-browser click @e1

Project settings:  ./agent-browser.json     (committed, portable)
This machine:      ${CONFIG_FILE}
MCP server:        ./.mcp.json  ->  agent-browser mcp --tools core

Caveats that will bite you, in docs/AGENT-BROWSER.md.
DONE
