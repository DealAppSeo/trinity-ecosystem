# agent-browser — install, and the four things that lie to you

**Status: installed and smoke-tested 2026-08-14** on the Claude Code cloud
container (Linux x86_64, Node v22.22.2). Every claim below was executed, not
read. Where something was not executed it says NOT CHECKED.

[vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) is a
native (Rust) browser-automation CLI aimed at agents. Apache-2.0.

Install: `npm run setup:browser` (wraps `scripts/setup-agent-browser.sh`).

## Why it is here

The thing it does that raw Playwright does not: `snapshot` prints the
accessibility tree with stable refs, and every action takes a ref.

```
$ agent-browser snapshot -i
- heading "Trinity smoke test" [level=1, ref=e1]
- textbox "query" [ref=e2]
- button "Go" [ref=e3]

$ agent-browser fill @e2 hello-trinity
$ agent-browser click @e3
```

An agent never has to guess a CSS selector, and a wrong guess fails loudly
(`Unknown ref: e2`) instead of silently matching the wrong node. That property
is the reason to prefer it here — this repo's recurring defect is systems that
report success they have not earned, and a selector that quietly matches
nothing is exactly that defect in a test harness.

It also ships an MCP server (`agent-browser mcp`), registered for this project
in `.mcp.json` on the `core` tool profile.

## The four things that lie to you

Each of these cost time on 2026-08-14 and none of them is discoverable by
reading the README.

### 1. `npm i -g agent-browser` installs an old version, silently

agent-browser >= 0.28.0 declares `engines: { node: ">=24" }`. npm 10 prefers an
engine-compatible version when resolving a bare package name, so on Node
v22.22.2 the bare command installs **0.27.0** — seven releases behind — and
exits 0 with no warning. `npm view agent-browser version` reports `0.34.0`
throughout, so the two disagree and nothing says so.

**Always `npm i -g agent-browser@latest`.** That prints an `EBADENGINE` warning
on Node 22 and installs 0.34.0, which was smoke-tested here (open → snapshot →
fill by ref → click → read back, all pass). The engines field over-declares:
the CLI is a Rust binary and the Node wrapper does almost nothing.

### 2. `agent-browser install` cannot fetch Chrome from a sandboxed session

It downloads Chrome for Testing from `googlechromelabs.github.io`, which the
sandbox proxy answers with **403 to CONNECT**:

```
✗ Failed to fetch version info: ... (Connect): tunnel error: unsuccessful
```

Per `CLAUDE.md` § Network, that is a **policy denial, not an auth failure** — do
not rotate anything over it. `curl -sS "$HTTPS_PROXY/__agentproxy/status"`
confirms it under `recentRelayFailures`.

The setup script therefore points agent-browser at a Chrome already on disk. In
Claude Code cloud sessions that is Playwright's pre-installed Chromium at
`$PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`),
which drives real pages fine.

### 3. `agent-browser doctor` says "No Chrome binary found" while the browser works

```
Chrome
  fail  No Chrome binary found
        fix: agent-browser install
```

…printed in the same session in which `open`/`snapshot`/`click` all succeeded.
doctor probes its own cache, system Chrome, and the Puppeteer/Playwright dirs —
it does **not** read `executablePath` out of the config file that the launcher
does read. A red doctor row and a working browser are compatible.

Do not treat doctor's Chrome/Network rows as evidence in either direction. The
smoke test at the end of `scripts/setup-agent-browser.sh` is the evidence: it
drives a real page over loopback and asserts on the text the page produced.

### 4. Refs do not survive the process

`@e1` is scoped to the snapshot that produced it. This fails:

```
$ agent-browser snapshot -i     # e1..e3 printed
$ agent-browser click @e3       # ✗ Unknown ref: e3
```

Snapshot and act **in the same `batch`**, which is the documented agent pattern
anyway:

```
agent-browser --session mysess batch \
  "open http://localhost:3000" "snapshot -i" "fill @e2 hello" "click @e3" "get text #out"
```

Relatedly: `open` in one invocation and `get url` in the next returned
`about:blank`. Use a named `--session` and keep a flow inside one `batch`.

## Configuration layering

```
defaults -> ~/.agent-browser/config.json -> ./agent-browser.json -> env -> CLI flags
```

| where | what belongs there | committed? |
|---|---|---|
| `~/.agent-browser/config.json` | `executablePath`, `args` — machine-specific | no, written by the setup script |
| `./agent-browser.json` | headless, screenshot dir/format, output cap — portable | yes |
| `.mcp.json` | MCP server registration for Claude Code | yes |

**Keep `executablePath` out of the committed `agent-browser.json`.** The repo
file wins over the user file, so a hardcoded container path there would break
every other machine.

Two settings in the committed file are deliberate rather than cosmetic:

- `screenshotDir: ".agent-browser/screenshots"` — the directory is gitignored.
  **It only applies to `screenshot` with no path argument.** Measured:
  bare `screenshot` → `.agent-browser/screenshots/screenshot-<ts>.png`;
  `screenshot cfgcheck.png` → the repo root, because a relative path is
  resolved against the **daemon's** cwd rather than yours or the config's.
  During this install that dropped a stray PNG in the repo root while the shell
  was in the scratchpad. Pass an absolute path, or pass none.
- `maxOutput: 40000` — caps page text pulled into context. Measured on a
  160 KB page: 40,106 bytes returned with this config in effect, 160,034 bytes
  with the same command run from a directory the config does not cover.
  `docs/CONTEXT-BUDGET.md` measured structured tool output, not file reads, as
  the dominant context cost for this workload; an uncapped `get text body` on a
  real page is squarely in that category.

## Not installed / not checked

- **Not a package.json dependency, on purpose.** The npm package is ~73 MB
  (prebuilt binaries for every platform). devDependencies are installed during
  the Vercel and Railway builds, so listing it there would push 73 MB into both
  production build contexts for zero runtime benefit — and this repo has already
  lost a deploy to build-context bloat (`.gitignore`, `.claude/worktrees` at
  61.7 MB). Global install, out of the build path.
- **`agent-browser chat` is unavailable** — needs `AI_GATEWAY_API_KEY`. Not set,
  and not something to set without a decision about spend.
- **NOT CHECKED: driving the deployed surfaces.** The sandbox proxy denies most
  outbound hosts to the browser: `example.com` 403s at CONNECT, and `github.com`
  connects but fails TLS (`ERR_CERT_AUTHORITY_INVALID`) because Chrome does not
  trust `/root/.ccr/ca-bundle.crt`. So this cannot currently browse
  `www.aitrinitysymphony.com` from a cloud session; `GET /api/version` via
  Supabase `pg_net` (CLAUDE.md) remains the way to observe a deployed surface
  from here. Locally, and against `localhost:3000`, none of that applies.
- **NOT CHECKED: macOS and Windows.** The setup script has resolution paths for
  both, written but not executed.
