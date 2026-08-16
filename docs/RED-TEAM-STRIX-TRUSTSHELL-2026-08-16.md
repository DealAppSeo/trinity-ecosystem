# Strix against trustshell.dev — engagement record, 2026-08-16

**Request:** run [Strix](https://github.com/usestrix/strix) (open-source agentic
pentester) against TrustShell.dev.

**Outcome:** Strix could not be run from this agent session — three hard
blockers, all verified, none of them a property of the target. The attempt was
not wasted: a keyless passive pass surfaced two things worth recording, one of
them a gap in `CLAUDE.md`'s own topology table. Strix now has a run guide
(`scripts/redteam/tools/strix.md`) for an operator or external agent that has
what this session lacks.

---

## Why Strix did not run here

Verified 2026-08-16, in order of how fatal each is:

1. **No Docker daemon.** Strix runs its agents inside a sandbox container pulled
   on first run. `docker` is on PATH but `/var/run/docker.sock` is absent —
   `docker info` fails to connect. Evidence: `dial unix /var/run/docker.sock:
   connect: no such file or directory`.
2. **The target is proxy-denied from the container.** `curl https://trustshell.dev/`
   → `curl: (56) CONNECT tunnel failed, response 403`. Strix needs direct
   network reach to the target and would hit the same wall; `pg_net` reaches the
   host but Strix cannot route through it.
3. **No LLM credential to spend.** Strix needs `LLM_API_KEY` and spends it
   autonomously while firing live attack traffic. Not something to start
   unattended on someone else's key against a production surface.

These are the same constraints the charter was built around, which is exactly
why the charter models an external tool as a **collector**: Strix runs where
there is Docker and egress, and its PoCs come back here as evidence. See
`scripts/redteam/tools/strix.md`.

---

## What the passive pass found

All via `pg_net` (SSO-exempt, keyless). **Passive only — no exploitation, no
authenticated probing.** Raw capture in
`scripts/redteam/evidence/recon-trustshell-dev.json`.

### Finding 1 — `trustshell.dev` is a live Vercel surface absent from the topology table (Informational)

`CLAUDE.md` § Deployment topology lists `trustrails.dev`, `hyperdag.org` and the
`aitrinitysymphony` domains, but **not `trustshell.dev`**. It is live:

| host | status | served by | note |
|---|---|---|---|
| `trustshell.dev` (apex) | 200 | Vercel `sfo1` | canonical host is `www` |
| `www.trustshell.dev` | 200 | Vercel `sfo1`, `server: Vercel` | Next.js SSR, deploy `dpl_J53jTJ3cXfRJPuQcoV3XtSPzEwC5` |
| `www.trustshell.dev/api/version` | **404** | Vercel `sfo1` | no version endpoint |

Two consequences for any future assessment of this surface:

- **It is a real Next.js app, not a placeholder** — so the module-scope Supabase
  build trap, the anon-RLS exposure and the receipt/config story that apply to
  the other Vercel surfaces are all *candidates* here and none has been checked.
- **There is no `/api/version`**, so "which commit is live" and "is the audit
  secret set" — the questions `LIVE-001` answers for the aitrinitysymphony
  surfaces — are **not observable** on trustshell.dev. That is itself a gap: the
  config-readiness endpoint is the thing that made those questions answerable
  without POSTing a payment to production.

*Boundary.* This establishes the host is live and Vercel-served with no version
endpoint. It does **not** establish which repo builds it, whether it shares the
`trustrails-dev` decoy-project problem, or anything about its data plane. Those
need the Vercel project's `domains` array and a repo mapping — the exact check
`CLAUDE.md` insists on before concluding anything about a live domain from a
project.

### Finding 2 — thin response-header security posture on the root document (Low)

Observed on the `www.trustshell.dev` root document:

| header | value |
|---|---|
| `strict-transport-security` | `max-age=63072000` ✓ (2 years) |
| `content-security-policy` | **absent** |
| `x-frame-options` | **absent** |
| `x-content-type-options` | **absent** (no `nosniff`) |
| `referrer-policy` | **absent** |
| `permissions-policy` | **absent** |

HSTS is set well; the rest of the standard hardening headers are not present on
this response. Absent CSP *and* absent `X-Frame-Options` together mean no
response-level framing defence was observed, which is the clickjacking and
content-injection surface Strix's browser agent is built to confirm dynamically.

*Boundary — read this before acting on it.* These are the headers on the **SSR
root document only**, seen from one egress path. A CSP or frame guard applied by
middleware on other routes, or a `<meta http-equiv>` CSP in the hydrated
document, would not appear here — and **post-hydration behaviour is NOT
CHECKABLE from an agent session** (`CLAUDE.md` § Network). So this is a *lead for
Strix to confirm*, not a closed finding. The right next step is exactly the tool
that was requested: point Strix's browser agent at it and let it try to frame the
page and sniff a response.

---

## The run path (for whoever has Docker + egress + a key)

```bash
export STRIX_LLM="anthropic/claude-sonnet-4-6"
export LLM_API_KEY="<key>"
pipx install strix-agent

strix --target /path/to/trinity-ecosystem       # code first — no live traffic
strix --target https://www.trustshell.dev       # then the deployment
strix view
```

Feed results back per `scripts/redteam/tools/strix.md`: a validated PoC becomes a
probe in `scripts/redteam/probes/`; a raw observation becomes a file in
`scripts/redteam/evidence/`. Strix's severity is an input, not our verdict.

---

## Coverage

| item | status |
|---|---|
| Strix execution from this session | **NOT RUN** — no Docker daemon, target proxy-denied, no LLM key |
| trustshell.dev liveness / platform | **CHECKED** via pg_net — live, Vercel sfo1 |
| trustshell.dev response-header posture (root) | **CHECKED** via pg_net — HSTS only |
| trustshell.dev per-route headers, hydrated CSP | **NOT CHECKED** — needs a browser agent (Strix) |
| trustshell.dev repo/project mapping, data plane | **NOT CHECKED** — needs Vercel project `domains` + repo |
| Any dynamic / exploit validation | **NOT ATTEMPTED** — that is Strix's job, once it can run |

## Recommended next steps

1. **Add trustshell.dev to `CLAUDE.md` § Deployment topology** with its Vercel
   project id and the repo that builds it, so the next reader does not rediscover
   a live surface. (Left to the human — editing the topology table from an
   assumption is the mistake that table exists to prevent; it needs the Vercel
   `domains` array to fill in correctly.)
2. **Run Strix** per the guide, `--target <repo>` first.
3. If the header posture holds up under Strix's browser agent, it is a small,
   safe Vercel config change (add CSP / `X-Frame-Options` / `nosniff`).
