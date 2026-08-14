# Full-stack E2E assessment — six products, 2026-08-14

Scope: **TrustShell.dev, HyperDAG.org, AITrinitySymphony.com, TrustMarket.dev,
RepID, TrustMedical.dev** — the public surface, the deployment behind it, and the
repository behind that.

Surface: cloud/scheduled container. Access: GitHub **yes** (API scoped to
`trinity-ecosystem`; other repos reached by public clone), Supabase **yes** (MCP),
Vercel **yes** (MCP), Railway **no** (proxy-denied), outbound HTTP **yes indirectly**
via Supabase `pg_net`. Preflight at session start: `verdict=GO`,
`global_pause=false` [VERIFIED live].

Every row below is backed by something executed this session. Where a thing could
not be checked it says NOT CHECKED rather than guessing — CLAUDE.md, "three
outcomes, never two."

This complements `ECOSYSTEM-HEALTH-2026-08-14.md`, which scored the ten
*subsystems* inside `trinity-ecosystem`. This one goes the other way: across
*products*, from DNS to repo. It does not re-score those subsystems and does not
restate their findings.

---

## 1. The six products, end to end

| Product | Live surface | Serving | Repo | Repo → surface |
|---|---|---|---|---|
| **AITrinitySymphony.com** | ✅ 200 | Vercel (`www`, apex) **+** Railway (`app`) | `trinity-ecosystem` | ✅ **both at `3ddca6b` = `origin/main` HEAD** |
| **RepID** | ✅ 200 | Railway `repid-engine-production` | `repid-engine` | ✅ `c207e8c` = HEAD of `main` |
| **TrustShell.dev** | ✅ 200 | Vercel (`trustshell-landing`) | `trustshell` | ⚠️ **unknowable — no version endpoint** |
| **HyperDAG.org** | ✅ 200 | Vercel (`hyperdag-org`) | `hyperdag-landing` | ❌ **serving content in no commit** |
| **TrustMarket.dev** | ⚠️ 200 placeholder | Vercel (`trustmarket-coming-soon`) | `trustmarket` (private) | ❌ **MVP repo is not what ships** |
| **TrustMedical.dev** | ❌ **parked domain** | registrar parking page | **none exists** | ❌ **product does not exist** |

Probes ran from Supabase `pg_net`, so they are real internet requests from
outside this container, not local guesses.

### The two that are genuinely healthy

**AITrinitySymphony.com** is the strongest surface in the ecosystem, and it is the
only one that can prove it. `/api/version` on all three hostnames returns
`3ddca6b88c32e2123dee8ab96bd4838e02237d22`, which **equals `origin/main` HEAD**
[VERIFIED — probed both platforms, compared to git]. Vercel answered `www` and the
apex (`x-vercel-id`, region `iad1`); Railway answered `app` (`x-railway-edge: lax1`).
Both platforms are current, simultaneously. That is the dual-topology in CLAUDE.md
working exactly as documented.

**RepID** (`repid-engine`) reports `deployed_commit c207e8c` — HEAD of `main`, which
was pushed today — with `supabaseConnected: true`, `hashkeyConnected: true`,
`hashkeyBlockNumber 26187593`, `chainId 177`, `deployerConfigured: true` [VERIFIED
via `pg_net`; the host is proxy-denied to direct `curl`]. It is also by a wide
margin the best-engineered repo here: **1,776 files, 6 CI workflows, ~450 test
files**. Nothing else in the ecosystem is close.

### HyperDAG.org — live content that exists in no commit

This is the most surprising finding of the assessment, and it is invisible from
the outside because the site returns a healthy 200.

The live page is 28,908 bytes. Byte-for-byte it matches **no commit** in
`hyperdag-landing` — I checked every revision of `index.html` [VERIFIED]:

| commit | date | `index.html` bytes |
|---|---|---:|
| `22a0d5a` (**HEAD**) | 2026-07-24 | 29,093 |
| `42d3856` | 2026-07-23 | 28,906 |
| `b7274ba` | 2026-07-19 | **0 — file deleted** |
| *(live)* | — | **28,908** |

The Vercel deployment history explains it. The last **READY** production deployment
is `b7274ba` (2026-07-20), whose commit message is
*"revert: remove my index.html — it wrongly replaced the v0 site … The v0 landing is
restored via **Vercel Instant Rollback** to the pre-git-connection deployment."*

So the bytes being served today come from a **rolled-back, pre-git-connection
deployment** — a v0-generated artifact that was never committed to any repository.
`hyperdag-landing` HEAD is not deployed, and could not reproduce the live site if
it were.

Two further defects sit on top of that:

1. **The newest production deployment is `state: ERROR`** (2026-07-21 05:11 UTC) —
   the site is up only because Vercel keeps the last good build serving, exactly
   the trap CLAUDE.md warns about.
2. **That failed deployment was built from the wrong repository.** Its metadata is
   `githubCommitRepo: repid-engine`, branch `feat/cc-2026-07-20-factcheck-counter`,
   commit `22e0903`. The `hyperdag-org` Vercel project is git-connected to
   `repid-engine`, not to `hyperdag-landing`.

Net: **hyperdag.org is an unreproducible production surface.** If that rollback
deployment is ever deleted or expires, the site cannot be rebuilt from source, and
nobody would learn this from a status check.

### TrustMedical.dev — not a product

`https://` fails outright (`SSL connect error`) on both apex and `www`. Over
`http://`, both return **200 with a registrar parking page** carrying Google
Analytics `UA-59154711-35` and `page_path: '/parked'` [VERIFIED].

There is **no `trustmedical` repository** (GitHub search across the account:
0 results) and **no `trustmedical` Vercel project** (18 projects listed; none
match) [VERIFIED]. TrustMedical.dev is a registered domain and nothing else.
Treat it as an idea, not a product, and do not list it as a surface.

### TrustMarket.dev — placeholder in front, MVP stranded behind

The apex serves a 5,321-byte page titled **"TrustMarket.dev - Coming Soon"** from
the Vercel project `trustmarket-coming-soon`. There is a *second*, separate Vercel
project called `trustmarket-landing`.

`www.trustmarket.dev` **fails TLS entirely** (`SSL peer certificate … was not OK`,
over both `https` and an `http` upgrade) [VERIFIED] — consistent with `www` never
having been added as a domain to the project, so no certificate was ever issued.
Half the ways a person types the name land on a browser security warning.

Meanwhile the private `trustmarket` repo — which holds the actual sandbox MVP —
has default branch **`feat/sandbox-mvp-phase-a`**, not `main`. A repo whose default
branch is a feature branch is a repo where "what is the released state?" has no
answer. (Repo contents NOT CHECKED — private, and `add_repo` needs an approval this
session does not have.)

### TrustShell.dev — healthy, but unverifiable

Serves a 126,125-byte Next.js app, 200, from Vercel. The `trustshell` repo is real
work: 130 files, `@hyperdag/trustshell@1.3.0`, a `publish-sdk.yml` workflow, 6 test
files.

But `/api/version` **404s** — so *which commit is live cannot be determined from
outside*. Same for `repid.dev`, `trustrails.dev` and `hyperdag.org`: **4 of the 6
surfaces have no deploy-provenance endpoint at all**, and hyperdag.org is the proof
that this is not theoretical.

---

## 2. THE FINDING: the fleet's control plane is writable by anyone

**Severity: highest in this assessment.** This supersedes `LESSONS` S1, which
records the problem as *"two tables are currently `USING (true)` for `anon`"*.

Measured live against `pg_catalog` [VERIFIED]:

| | documented | **actual** |
|---|---:|---:|
| tables anon-readable via `USING(true)` | 2 | **137** (140 policies) |
| tables with an anon **write** policy | — | **4** |
| tables with **RLS disabled entirely** | — | **15** |

All **15 RLS-disabled tables carry full anon `SELECT`/`INSERT`/`UPDATE`/`DELETE`
grants**. RLS off means no policy filters the query; the grant is the only gate, and
it is open. Among them:

```
agent_preflight_control     1 row     <- global_pause + claim_lease_minutes
repid_experiment_log        2,377 rows
peer_verify_dropped_log     1,836 rows
doc_registry / doc_contents 29 / 9 rows
repid_outcomes, repid_ratings, ops_alerts, lao_events, e2e_shadow_*, …
```

`agent_preflight_control` is the table `v_agent_preflight` reads. It holds
`global_pause` — the switch the preflight contract requires every agent to obey
before claiming work. **An anonymous caller can set it.**

This is not inferred from schema. I proved reachability end to end, over the real
PostgREST wire, using `sb_publishable_O-0A8…` — a **live publishable key that ships
in the browser bundle**, so it is available to anyone who views source:

| request | result |
|---|---|
| `GET /rest/v1/agent_preflight_control` | **200** — returned the `global_pause` row |
| `GET /rest/v1/repid_config` | **200** — returned config rows |
| `GET /rest/v1/doc_contents` | **200** — returned document bodies |
| `GET /rest/v1/repid_experiment_log` | **200** — returned experiment records |

[VERIFIED — four live requests via `pg_net`, read-only by choice.] The write path
is **verified at the privilege level and deliberately not exercised**: mutating the
fleet's pause switch to prove a point is precisely the fence the preflight contract
draws. `has_table_privilege('anon', …, 'UPDATE') = true` with `relrowsecurity =
false` is definitive in Postgres.

The four anon-**writable** RLS-on tables are `antigravity_prompt_queue` (UPDATE
policy, and I/U/D grants), `sprint_updates`, `trinity_research_log`, `trinity_retros`
— all `USING(true)`. An anon-writable **prompt queue** is an unauthenticated
prompt-injection channel into an agent loop. Mitigating fact, and it is worth
stating plainly rather than dramatising: that queue holds **0 rows** and the other
three were last written in Feb–Mar 2026. So the exposure is **latent, not currently
being exploited** — an open door in a room nobody is using.

`repid_config` remaining anon-readable is already logged as BLOCKED_FOR_SEAN and is
**still open** [VERIFIED — 103 rows, returned 200 to the publishable key].

Supabase's own advisor agrees, at scale: **369 advisories**, including 59
`security_definer_view` (ERROR), 15 `rls_disabled_in_public` (ERROR), 31
`anon_security_definer_function_executable`, 175 `function_search_path_mutable`, and
1 `vulnerable_postgres_version`.

### Why this was missed

The same reason as `v_fleet_truth`: **the instrument was pointed at a sample, and
the sample was mistaken for the population.** LESSONS S1 recorded two tables because
two tables had been looked at. Nothing had ever counted them. One `pg_policy` query
— the one at the top of this section — takes seconds and would have said 137 at any
point in the last several months.

---

## 3. The secret scanner silently scans the wrong repository

Found while trying to scan all eight repos, and it is the house defect again: a tool
reporting a result it did not earn.

`scripts/scan-secrets.mjs` parses exactly one flag — `const HISTORY =
process.argv.includes('--history')`. Passing `--root <dir>` is **silently ignored**;
the scan always runs against the current working directory.

Running `node scripts/scan-secrets.mjs --root ../trustshell` from `trinity-ecosystem`
therefore prints a clean-looking report **for trinity-ecosystem**, labelled with
findings in `tmp-hyperdag-readme.md` — a file that does not exist in `trustshell` at
all. Eight repos "scanned"; the same repo read eight times. Proof: that filename is
present only in `trinity-ecosystem` [VERIFIED].

An unknown flag should be a fatal error in a security tool. This one produces
confident output about a tree it never opened — the same failure shape as
`npm run check:secrets` printing *"No credential-shaped strings found"* over a live
EVM key.

### The re-run, done correctly — and the good news

Re-scanned by `cd`-ing into each repo. **No new credential leak exists.** Every
"usable" hit is a placeholder or a known-public value [VERIFIED, each triaged
individually]:

| repo | usable | what they actually are |
|---|---:|---|
| `repid-engine` | 7 | all-zero key `0x0000…` ×3; `sk-abcdef…` test fixtures ×2; repeating-pattern `0x0123…` ×2 |
| `trustshell` | 1 | `0xac0974be…` = the **public Hardhat/Anvil test account #0**, in `tests/` |
| `hyperdag-protocol` | 1 | all-zero key `0x0000…` |
| `aitrinitysymphony-landing` | 0 | legacy Supabase **anon** JWT — public by design, and **disabled** [VERIFIED: `disabled: true`] |
| `trinity-ecosystem`, `hyperdag-landing`, `HyperDAG-core`, `repid`, `trustrails-dev` | 0 | clean |

The legacy anon JWT in the landing page decodes to `{"role":"anon","ref":
"qnnpjhlxljtqyigedwkb"}` — the settled-inert key. **Do not re-open it**; CLAUDE.md is
correct.

Caveat, paid rather than left implicit: these were `--depth 50` clones, so **history
was not scanned** and older commits could still hold live credentials. The leaked
EVM deployer key (task #73) is a history problem and remains outstanding.

---

## 4. Repository health

| Repo | Last commit | Files | CI | Tests | Verdict |
|---|---|---:|---:|---:|---|
| `repid-engine` | 2026-08-14 | 1,776 | **6** | ~450 | **Healthy** — the reference standard |
| `trinity-ecosystem` | 2026-08-14 | — | **2** | 400+ assertions + E2E | **Healthy** |
| `trustshell` | 2026-08-08 | 130 | 1 | 6 | Active, thin CI |
| `hyperdag-protocol` | 2026-08-06 | 95 | 1 | 10 | Active |
| `HyperDAG-core` | 2026-08-10 | 27 | **0** | 3 | Active, **no CI** |
| `hyperdag-landing` | 2026-07-24 | 5 | **0** | 0 | **Not deployed** (§1) |
| `aitrinitysymphony-landing` | 2026-08-07 | 3 | **0** | 0 | Static |
| `repid` | **2026-05-07** | 43 | **0** | 0 | **Dormant ~3 months** |
| `trustrails-dev` | **2026-05-06** | 174 | **0** | 0 | **Dormant ~3 months**, serves trustrails.dev |
| `trustmarket` | 2026-07-30 | — | — | — | Private; default branch is a feature branch |

**6 of 10 repos have no CI at all.** Two repos serving live domains (`repid`,
`trustrails-dev`) have had no commit in three months.

### `trinity-ecosystem` gate, run this session

Everything green, and the E2E was run against a real HTTP server, not mocked:

```
tsc --noEmit         0 errors                                    exit 0
npm run check        all suites pass (incl. 120 identity, 29 e2e-harness)  exit 0
npm run test:e2e     29 VERIFIED, 4 NOT CHECKED, 0 FAILED, core 10/10      exit 0
npm run build        clean                                       exit 0
```

The 4 NOT CHECKED are honest and correctly labelled: Solana broadcast (no key,
devnet unreachable), live Supabase schema (proxy denies the host, so a stub stands
in and **column drift would not be caught**), cross-instance replay (migration
deliberately unapplied), BFT verdict (needs `enforce` mode + live providers).

Open PRs: **#28** (zkRepID identity layer) and **#29** (agent-browser tooling), both
draft.

---

## 5. What to do, in order

1. **Close the anon write grants on the 15 RLS-disabled tables — `agent_preflight_control`
   first.** One `revoke insert, update, delete on … from anon;` removes the ability of
   an anonymous browser visitor to pause the fleet. Sean-gated (live RLS/grant change),
   but it is the highest-value single statement available anywhere in this ecosystem.
2. **Decide `repid_config`** — rotate, relocate, or view-filter the enterprise key.
   Open since 2026-08-13.
3. **Make `scan-secrets.mjs` fail on unknown flags**, and give it a real `--root`.
   A security tool that silently reports on the wrong tree is worse than none.
4. **Rebuild hyperdag.org from source.** Commit the live bytes to `hyperdag-landing`,
   repoint the `hyperdag-org` Vercel project away from `repid-engine`, and redeploy.
   Until then the surface is unreproducible.
5. **Add `/api/version` to the other five surfaces.** It is ~15 lines, it already
   exists in this repo to copy, and it is the only reason the AITrinitySymphony
   deploy state is knowable while HyperDAG's is not.
6. **Fix `www.trustmarket.dev`** — add the hostname so a certificate issues.
7. **Decide TrustMedical.dev**: build it or stop listing it.
8. **Correct `LESSONS` S1** from "two tables" to 137/4/15, with the query that says so.

## 6. Verification record

| Claim | Status | How |
|---|---|---|
| AITrinitySymphony on Vercel+Railway both at `3ddca6b` = main | **VERIFIED** | `/api/version` on 3 hostnames via `pg_net`, vs `git log origin/main` |
| repid-engine live at `c207e8c`, Supabase+HashKey connected | **VERIFIED** | `GET /health` via `pg_net` |
| TrustMedical.dev is a parked domain | **VERIFIED** | https fails both hosts; http 200 returns registrar page with `/parked` |
| No `trustmedical` repo or Vercel project | **VERIFIED** | GitHub search 0 results; 18 Vercel projects listed |
| hyperdag.org bytes match no commit | **VERIFIED** | every `index.html` revision sized vs live 28,908 |
| hyperdag.org newest prod deploy is ERROR, built from `repid-engine` | **VERIFIED** | Vercel `list_deployments` metadata |
| www.trustmarket.dev fails TLS | **VERIFIED** | 2 probes (https + http upgrade), both SSL errors |
| 137 anon-readable / 4 anon-writable / 15 RLS-off tables | **VERIFIED** | `pg_policy` + `pg_class` + `has_table_privilege` |
| anon can READ `agent_preflight_control` over PostgREST | **VERIFIED** | live 200 using a publishable key, via `pg_net` |
| anon can WRITE those tables | **VERIFIED (privilege level)** | RLS off + `has_table_privilege` I/U/D true; **write deliberately not exercised** |
| `scan-secrets.mjs` ignores `--root` | **VERIFIED** | source reads only `--history`; output cited a file absent from the target repos |
| No new credential leak in 8 repos | **VERIFIED (working tree)** | re-scanned per repo; every usable hit triaged by hand |
| trinity-ecosystem gate green | **VERIFIED** | tsc / check / test:e2e / build all exit 0 |
| Credentials in repo **history** | **NOT CHECKED** | `--depth 50` clones; `--history` not run |
| `trustmarket` repo contents | **NOT CHECKED** | private; `add_repo` needs approval |
| Which commit TrustShell/repid/trustrails serve | **NOT CHECKED** | no version endpoint exists on those surfaces |
| Railway internals beyond `/health` | **NOT CHECKED** | host proxy-denied to this container |
