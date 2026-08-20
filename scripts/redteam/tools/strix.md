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

## Why it does not run from a Claude agent session

Recorded so nobody re-derives it. All three are hard blockers, verified
2026-08-16:

1. **No Docker daemon.** Strix runs its agents inside a sandbox container it
   pulls on first run. `docker` is on PATH here but `/var/run/docker.sock` is
   absent — `docker info` fails to connect. No daemon, no Strix.
2. **The target is proxy-denied.** Strix needs network access to the target, and
   every custom domain in this project answers `curl: (56) CONNECT tunnel
   failed, response 403` from the container (`CLAUDE.md` § Network). Strix's HTTP
   proxy would hit the same wall. `pg_net` reaches these hosts, but Strix cannot
   route through it.
3. **No LLM credential to spend.** Strix needs `LLM_API_KEY`, and a run spends it
   autonomously while sending live attack traffic at a target. That is not
   something to start from an unattended session on someone else's key.

So Strix is run **by an operator, or by an external agent with Docker and
egress** — and its output is fed back here.

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
