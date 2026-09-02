# Running Strix against a Trinity / TrustShell surface

[Strix](https://github.com/usestrix/strix) is an open-source agentic pentester:
autonomous AI agents that drive an HTTP proxy, a browser and a shell against a
target, validate findings with proof-of-concept exploits, and map them to the
OWASP Top 10. It is a strong fit for the surfaces this suite cannot reach — the
**deployed web apps**, where the interesting failures are client-side and
dynamic rather than in the trust arithmetic our probes execute directly.

It belongs on the **collector** side of `docs/RED-TEAM-CHARTER.md`: Strix
produces observations and reproductions; a human (or a probe here) decides what
is a finding. Its own PoCs are the evidence — exactly the transcript this suite
demands.

## What blocks the LOCAL CLI path from a Claude agent session

Recorded so nobody re-derives it. These block the **local open-source CLI**
specifically — not every path (see the managed path below). Blocker 1
re-verified 2026-09-02, `/var/run/docker.sock` still absent:

1. **No Docker daemon.** The local CLI runs its agents inside a sandbox
   container it pulls on first run. `docker` is on PATH here but
   `/var/run/docker.sock` is absent — `docker info` fails to connect. No daemon,
   no local Strix.
2. **The live target is proxy-denied.** For a black-box run against the
   deployment, Strix needs network reach, and every custom domain answers
   `curl: (56) CONNECT tunnel failed, response 403` from here (`CLAUDE.md` §
   Network). This does NOT block a source-aware run against a **local clone** —
   that needs no egress.
3. **No LLM credential to spend.** The local CLI needs `LLM_API_KEY` and spends
   it autonomously while sending live attack traffic. Not something to start
   unattended on someone else's key.

**Two of these three are defeated by the managed path.** The 2026-08-16 note
called all three "hard blockers"; that was true only of the local CLI. Strix's
`managed-pentesting-with-strix` skill drives the cloud platform via REST and
needs **no local Docker and no LLM key** (README: *"drive the managed
app.strix.ai platform via REST — no local Docker or LLM key"*) — it needs an
`app.strix.ai` account instead. And a **source-aware run against a local clone**
needs no live-target egress. So the runnable-from-a-cloud-session path is: the
managed platform (account required), and code review of a local checkout.

## Readiness — staged for the operator (do this once you have the account)

**Install the skills** (installs nine, incl. `ci-security-scanning-with-strix`,
`managed-pentesting-with-strix`, `fix-security-vulnerabilities-with-strix`):

```bash
npx skills add usestrix/strix
```

**Optional — expose this repo's own MCP tools to a Strix run.** Strix reads
`~/.strix/mcp-servers.json` and namespaces each server's tools. Template:

```jsonc
// ~/.strix/mcp-servers.json
{
  "servers": [
    {
      "name": "local_fs",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/trinity-ecosystem"],
      "allowed_tools": ["read_file", "list_directory"]   // read-only; omit to expose all
    }
  ]
}
```

A server that fails to connect is skipped without failing the run; point Strix
at a different file with `STRIX_MCP_CONFIG`.

**PR review is ALREADY LIVE via the GitHub App — you do NOT need a workflow for
it** [MEASURED 2026-09-02]. Once `strix cloud integrations install github` is
done, `strix-security[bot]` posts an automated security review on each PR by
itself: it reviewed `trinity-ecosystem#158` and returned *"No security issues
found"* with no workflow file and no repo secret. Prefer that path; it is
least-privilege (a per-repo App install), needs no `STRIX_API_KEY` in CI, and is
what this repo now runs.

**CI template — the SELF-HOSTED / CLI alternative, staged and OFF.** Use this only
if you want the open-source CLI in your own CI instead of (or alongside) the App —
e.g. to run a probe-porting step in the same job. It needs a repository secret
`STRIX_API_KEY` (Settings → Secrets and variables → **Actions**, not Variables —
see `CLAUDE.md` § CI); a workflow that runs Strix against an empty secret fails
every PR, so keep it off until the secret exists, then drop it in as
`.github/workflows/strix-diff.yml`:

```yaml
# .github/workflows/strix-diff.yml  — ENABLE ONLY AFTER STRIX_API_KEY EXISTS
name: strix-diff
on: pull_request
jobs:
  strix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # diff mode needs the base ref
      - name: Strix diff-scoped review
        env:
          STRIX_API_KEY: ${{ secrets.STRIX_API_KEY }}
        run: |
          npx skills add usestrix/strix
          # diff mode: review only what this PR changed, at the charter's evidence bar
          strix-managed --mode diff \
            --base "${{ github.event.pull_request.base.sha }}" \
            --head "${{ github.sha }}" \
            --target . || true          # never fail the PR on findings — they go to the ledger
      # Follow-up: a step that ports confirmed PoCs into scripts/redteam/probes/ and evidence/.
```

The `|| true` is deliberate: Strix findings are **collector output**, not a
verdict (charter §1). They land as evidence + a probe here; a probe going
BREACHED is what fails CI, not Strix's own severity.

So Strix is run **by an operator (managed or local), or an external agent with
Docker and egress** — and its output is fed back here through the loop below.

## Run it (operator / external collector)

Requires Docker running and an LLM key. Against the live app:

```bash
export STRIX_LLM="anthropic/claude-sonnet-4-6"   # or openai/…, see Strix docs
export LLM_API_KEY="<your key>"

pipx install strix-agent      # or: pip install strix-agent
strix --target https://www.trustshell.dev

# headless, for CI or a remote runner:
strix -n --target https://www.trustshell.dev
strix view                    # review the latest run
```

Against the code instead of the deployment — no egress needed, and it reads the
route handlers our probes can only inspect statically:

```bash
strix --target /path/to/trinity-ecosystem
```

## Scope and rules — the same ones the charter sets

- **Testnet / devnet only. Never move real mainnet value.** The payment path
  reaches Solana; keep it simulated.
- **No denial of service, no load generation.** Strix is an exploiting tool;
  keep it to correctness, not resilience, on a live production surface.
- Prefer the `--target <repo>` run first — it finds the injection and
  access-control classes with zero live traffic.
- Third-party infrastructure (Vercel, Supabase, Railway as platforms) is out of
  scope. Our configuration of them is in.

## Feeding results back

Two routes, in order of value:

1. **A reproduction becomes a probe.** If Strix validates something with a PoC,
   port it to `scripts/redteam/probes/` so it runs forever — the anchor,
   inputs, and what-a-breach-looks-like are all in the PoC already. That turns a
   one-off Strix run into a standing regression test.
2. **A raw observation becomes evidence.** Drop the finding into
   `scripts/redteam/evidence/` in the README's shape (verbatim, with collector
   and egress path). Do not paste Strix's severity as our verdict — a probe
   here judges it. See `docs/RED-TEAM-CHARTER.md` §1 for why the collector never
   sets the verdict.
