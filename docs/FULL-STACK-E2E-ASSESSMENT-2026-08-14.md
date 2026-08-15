# Full-stack E2E assessment — seven products, 2026-08-14

Scope: **TrustShell.dev, HyperDAG.org, AITrinitySymphony.com, TrustMarket.dev,
RepID, TrustChat.dev, AISocialMirror.com** — the public surface, the deployment
behind it, and the repository behind that.

**TrustMedical.dev is deliberately out of scope** (revised 2026-08-15). The
measurement that put it here was correct — parked domain, no repo, no project —
but listing a parked domain in a product table implies a product, and this one
does not exist yet. Whether that concept belongs anywhere is a product decision,
possibly under TrustRails or TrustTrader; it is not a measurement, and this
document does not make it. The domain is still registered and still parked; that
single fact is retained in §6 so it is not rediscovered at full price.

Two surfaces are added in its place — **TrustChat.dev** and **AISocialMirror.com**
— because both are live products where humans train an agent and rate agents and
LLMs. That makes them signal sources for the reputation system, not just extra
surfaces; §1a covers what that signal is worth and what currently consumes it
(nothing). Their rows were probed **2026-08-15**, a day after the rest of this
document, and are dated as such.

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

## 1. The seven products, end to end

| Product | Live surface | Serving | Repo | Repo → surface |
|---|---|---|---|---|
| **AITrinitySymphony.com** | ✅ 200 | Vercel (`www`, apex) **+** Railway (`app`) | `trinity-ecosystem` | ✅ **both at `3ddca6b` = `origin/main` HEAD** |
| **RepID** | ✅ 200 | Railway `repid-engine-production` | `repid-engine` | ✅ `c207e8c` = HEAD of `main` |
| **TrustShell.dev** | ✅ 200 | Vercel (`trustshell-landing`) | `trustshell` | ⚠️ **unknowable — no version endpoint** |
| **HyperDAG.org** | ✅ 200 | Vercel (**`hyperdag-trust`**) | `hyperdag-landing` | ✅ **current — prod deploy READY at `fbf8253` = main HEAD; live bytes md5-identical to the repo.** An earlier "serving content in no commit" verdict here was **RETRACTED**, see §1 |
| **TrustMarket.dev** | ⚠️ 200 placeholder | Vercel (`trustmarket-coming-soon`) | `trustmarket` (private) | ❌ **MVP repo is not what ships** |
| **TrustChat.dev** | ✅ 200 | Vercel (**`v0-trustchat`**) | `trustchat-frontend` (private) + `trustchat-backend` (public) | ✅ **live HTML carries `data-dpl-id` = the latest production deploy** |
| **AISocialMirror.com** | ✅ 200 | Vercel (**`v0-ais-ocial-mirror-landing-page`**) | `AISocialMirror` (private) | ⚠️ **prod deploy 2026-03-29, repo pushed 2026-04-18 — a 20-day gap** |

Probes ran from Supabase `pg_net`, so they are real internet requests from
outside this container, not local guesses. The last two rows were probed
2026-08-15; the rest 2026-08-14.

Both new rows were confirmed against each Vercel project's **`domains` array**,
not its name — `v0-trustchat` and `v0-ais-ocial-mirror-landing-page` are the
serving projects because those arrays contain the apex and `www`. Matching a
project name to a domain is what produced the retracted HyperDAG finding in §1,
and the trap is live in this account: `hyperdag-org` and `trustrails-dev` are both
named after domains they do not serve.

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

### ~~HyperDAG.org — live content that exists in no commit~~ **RETRACTED 2026-08-14**

> **This finding was wrong. hyperdag.org is healthy, current, and fully
> reproducible from source.** It was published as "the most surprising finding of
> the assessment"; it was in fact the most wrong. Do not cite any part of it.
>
> Re-probed the same day it was published, after a reviewer correctly refused to
> accept a dated snapshot as current. Both errors below were mine, and they
> compounded — each on its own would have produced a false alarm.

**Error 1 — the wrong Vercel project.** There are two similarly-named projects.
The finding examined `hyperdag-org`, whose name matches the domain. But
`hyperdag-org` serves **no custom domain at all** — its `domains` array holds only
`*.vercel.app` URLs [VERIFIED]. The site is served by **`hyperdag-trust`**
(`prj_dCnluMVr737d1wyhPbnc3WblKMYw`), whose domains include `hyperdag.org` and
`www.hyperdag.org`. Everything alarming — the `state: ERROR` production deploy,
the `githubCommitRepo: repid-engine` metadata — is true of `hyperdag-org`, a
project with no traffic, and false of the one that serves the site.

`hyperdag-trust`'s newest **production** deployment is `dpl_7677Yu3L…`:
`state: READY`, `target: production`, built from `hyperdag-landing` on `main` at
commit `fbf8253` — the repository's own HEAD [VERIFIED].

**Error 2 — a unit mismatch, and it is the one that should sting.** The claim
rested on 28,908 ≠ 29,093. Those are the *same file measured two ways*: the live
figure came from Postgres `length(content)`, which counts **characters**, and the
repo figure from `wc -c`, which counts **bytes**. The file contains 185 multi-byte
UTF-8 characters. Confirmed by hashing both [VERIFIED]:

```
live  www.hyperdag.org   md5 ff2ef682522185a58e942b1dbd84c6d3
repo  index.html         md5 ff2ef682522185a58e942b1dbd84c6d3   ← identical
```

The live page is **byte-for-byte** the committed file. The "Instant Rollback to a
pre-git deployment" story was constructed to explain a discrepancy that did not
exist, and is unsupported by the deployment history.

**What this cost, and the lesson that generalises.** The assessment already
contained one census error of exactly this shape — the anon-access counts, where
the instrument was pointed at a sample and the sample mistaken for the population.
This is the same defect in a different disguise: *two numbers were compared
without checking they were the same kind of number.* A byte count and a character
count are not comparable, and nothing in the pipeline said so. The check that
would have caught it costs one command — hash both sides, do not diff their
lengths. Comparing derived scalars when the artifacts themselves are available is
the error; `md5` was available the whole time.

The endpoint added in `hyperdag-landing` PR #5 is **still worth having**, but for
the opposite reason to the one it was justified with: this episode is proof that
inferring a deployment's identity from *outside* is error-prone. `GET /api/version`
would have answered "which commit is this?" in one request and prevented two wrong
conclusions.

### TrustChat.dev — live, current, and the best-provenanced surface after AITrinitySymphony

Apex 302s to `www`; both return **200** from Vercel (`sfo1`), 19,494 bytes,
titled **"TrustChat — Real-time Hallucination Detection"** [VERIFIED 2026-08-15].

Served by the Vercel project **`v0-trustchat`**, confirmed by its `domains` array
holding both `trustchat.dev` and `www.trustchat.dev`. Its latest production
deployment is `dpl_6Yov5QatkQUCc8HM5DABYPJt5FEd`, `readyState: READY`, created
**2026-08-10** — and the served HTML carries
`data-dpl-id="dpl_6Yov5QatkQUCc8HM5DABYPJt5FEd"`, the **same id** [VERIFIED].

That last point matters beyond this row. `/api/version` **404s** here, so by the
test used everywhere else in this document TrustChat should be "unknowable". It
is not, because Next.js stamps the deployment id into the served markup: comparing
`data-dpl-id` against the project's `latestDeployment.id` answers "is the live page
the newest deploy?" without any cooperation from the app. **That is a
provenance check available on every Vercel-served surface here**, and it is
strictly weaker than `/api/version` — it names a *deployment*, not a *commit*, so
it cannot tell you which source built it. Use it where `/api/version` is missing;
it does not remove the need for §5.5.

Two repos back it: `trustchat-frontend` (private, pushed **2026-08-10T07:46Z**) and
`trustchat-backend` (public, pushed 2026-06-02). The frontend push date and the
production deploy date are the same day, consistent with the deploy coming from
that push — **though "same day" is not "same commit"**, and no commit-level link
was checked. Repo contents NOT CHECKED (private, and outside this session's
GitHub scope).

### AISocialMirror.com — live, but the deploy is 4.5 months old

Apex 302s to `www`; both return **200** from Vercel (`sfo1`), 29,011 bytes, titled
**"AISocialMirror – AI Reveals Your Hidden IQ, EQ & SQ"** [VERIFIED 2026-08-15].

Served by **`v0-ais-ocial-mirror-landing-page`**, again confirmed by its `domains`
array. Its newest production deployment is READY but was created **2026-03-29** —
**138 days before this probe**. The backing repo `AISocialMirror` (private) was
last pushed **2026-04-18**, twenty days *after* that deploy.

What that gap means is **NOT CHECKED**, deliberately. A push can land on a
non-default branch, and `pushed_at` moves for any branch, so "there are twenty
days of undeployed commits" does not follow from these two dates. What *is*
established is that the newest production deploy predates the newest push, which
is the condition worth looking at. The served HTML carries no `data-dpl-id`, so
the trick that worked for TrustChat does not work here — live-versus-latest is
genuinely unverifiable from outside for this surface.

Neither surface exposes `/api/version`. That makes **6 of the 7 products** with no
commit-level provenance endpoint, which strengthens rather than changes §5.5.

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

[PROBED 2026-08-15: `@hyperdag/trustshell@1.3.0` — installed and inspected. It is
the HAL/RepID SDK against a live backend, not a receipt library: searching its
published `dist/` for `transcript`, `audit_hash` and `session_receipt` returns zero
occurrences of any of the three. Named here only as evidence that the `trustshell`
repo ships a real package; nothing in this document depends on what it does.]

But `/api/version` **404s** — so *which commit is live cannot be determined from
outside*. Same for `repid.dev`, `trustrails.dev`, `hyperdag.org`, `trustchat.dev`
and `aisocialmirror.com`: **6 of the 7 surfaces have no deploy-provenance endpoint
at all**, and hyperdag.org is the proof that this is not theoretical.

---

## 1a. The signal TrustChat and AISocialMirror produce — and what consumes it

This is the reason those two are in scope rather than merely live. On both, humans
train an agent and rate agents and LLMs. That is **human judgement about which
model was right**, which is the one input the reputation system cannot generate
for itself.

**Nothing consumes it today.** Searched across `lib/` and `app/` for any
external-rating or feedback ingestion path — `human_rating`, `user_rating`,
`external_signal`, `feedback_ingest`, `rate_agent`, `thumbs` — **0 files match**
[VERIFIED]. The reputation machinery exists and is well developed
(`EarnedMetrics`, `harness/reputation.ts`, `identity/reputation-transition.ts`),
but every observation reaching it is generated internally from task outcomes.
There is no path, partial or planned-in-code, from either surface into it.

Two things stand between the signal and the ledger, and only one is plumbing.

**1 — the shapes do not match, and forcing them loses information.**
`EarnedMetrics.Observation` is `{ observedAt, success: boolean, domain? }`: a
binary outcome, aged on a 30-day half-life against a prior. A human rating is not
binary and is not a task outcome. Collapsing "4 out of 5" into `success: true`
throws away the part that carries the most information — the disagreement — and
does it invisibly. Deciding that mapping is a **design question that must be
answered before any ingestion is written**, not after. Rating an *LLM* and rating
an *agent* are also different signals; `ReputationLedger` is keyed to experts in
the dispatch pool, and a raw model rating has no expert to attach to.

**2 — an unauthenticated rating is a write to the reputation system, and §2 of
this document is what happens when a control plane is writable.** Ratings arrive
from the public internet. If they reach `ReputationLedger` without
authentication, rate-limiting and per-rater identity, then anyone who can load a
page can move which expert the dispatcher picks — the same class of exposure as
the anon-writable `agent_preflight_control` below, reached by a different door.
The EWMA at `alpha: 0.06` does not save you: it is deliberately forgetful, so a
sustained campaign moves it and a sparse one does not, which is exactly backwards
for abuse resistance.

The useful next step is therefore **not** "wire the surfaces up". It is:

- **Capture the raw signal now, in its own table, consumed by nothing.** Ratings
  not recorded are gone forever; ratings recorded but unconsumed cost a table.
  Store rater identity, target (agent *or* model, distinguished), the raw scale,
  and the timestamp — raw, not pre-collapsed to a boolean.
- **Answer the mapping question separately**, against real captured data, with
  the volume in hand to know whether the signal even discriminates. The repo has
  a precedent worth copying: `co-failure lift` was measured, found to saturate,
  and rejected as a gate signal (`PRIOR-WORK-INDEX`, CLOSED). Do that here before
  wiring, not after.
- **Treat ingestion as a privileged write** whenever it does get built —
  server-side, authenticated, rate-limited, with the raw row retained so a bad
  mapping can be recomputed rather than re-collected.

Until the first bullet exists, the honest status of "are we incorporating the
signal from TrustChat and AISocialMirror?" is **no, and none of it is being
retained** — which is the more expensive half of that answer.

---

## 2. THE FINDING: the fleet's control plane is writable by anyone

**Severity: highest in this assessment.** This supersedes `LESSONS` S1, which
records the problem as *"two tables are currently `USING (true)` for `anon`"*.

Measured live against `pg_catalog` [VERIFIED]:

| | documented | **actual** |
|---|---:|---:|
| tables anon-**readable** (effective) | 2 | **193** = 15 RLS-off + 178 open policy |
| tables anon-**writable** (effective) | — | **60** = 15 RLS-off + 45 open policy |
| tables with **RLS disabled entirely** | — | **15** |
| tables RLS-on with no policy (locked) | — | 52 |
| total tables in `public` | — | 621 |

> **Correction, 2026-08-14.** The first published version of this table said
> **137 readable / 4 writable**. Both were wrong and the write figure was wrong by
> 15×. The query counted only policies whose `polroles` *explicitly names* `anon`,
> and silently dropped every policy granted to `PUBLIC` (`polroles = '{0}'`) — which
> covers `anon` just as completely. It also scored a policy as open on the strength
> of the role alone, without checking whether its `USING` clause was literally
> `true`; the corrected count excludes conditioned policies such as
> `auth.uid() = user_id`, which apply to `anon` but deny it. Superseded figures:
> **137 readable, 4 writable — do not cite.**

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

**The "latent exposure" claim in the first version of this document was wrong, and
it was wrong in the way this repo keeps getting wrong: the sample was mistaken for
the population.** That version named four writable tables, observed that
`antigravity_prompt_queue` holds 0 rows and the other three were last written in
Feb–Mar 2026, and concluded the exposure was *"latent, not currently being
exploited — an open door in a room nobody is using."*

The room is not empty. Counting all 60 anon-writable tables by rows [VERIFIED]:

```
trinity_artifacts        155,428 rows   open policy   <- I/U/D by anon
trinity_agent_logs       139,659 rows   open policy
trinity_task_tags         13,045 rows   open policy
autonomous_logs            6,840 rows   open policy
trinity_evolution_vault    5,031 rows   open policy
repid_experiment_log       2,322 rows   RLS OFF
peer_verify_dropped_log    1,654 rows   RLS OFF
anfis_routing_logs / agent_capabilities / trinity_agent_registry / …
```

Roughly **324,000 rows of agent memory, artifacts and execution history are
anonymously deletable** by anyone holding a key that ships in the browser bundle.
`trinity_evolution_vault` and `trinity_agent_registry` are agent state, not logs.
The correct characterisation is the opposite of the one published: this is a live
**integrity** exposure of the fleet's working memory, and only the confidentiality
half is mild (see below). No evidence of actual exploitation was sought or found —
"not currently being exploited" was never measured and should not have been written.

An anon-writable **prompt queue** remains an unauthenticated prompt-injection
channel into an agent loop; that part of the original finding stands.

### What is *not* exposed — the confidentiality half

Checked directly, because "193 readable tables" invites the wrong conclusion
[VERIFIED]. Of every anon-readable table carrying a secret- or PII-shaped column:

| table | rows | populated sensitive values |
|---|---:|---|
| `repid_agents` (`webhook_secret`) | 176 | **0** |
| `user_keys` (`trinity_api_key`) | 0 | 0 |
| `managers` (`api_key_encrypted`) | 6 | **0** |
| `aidebate_users`, `clashy_waitlist`, `demo_views` (emails) | 0 | 0 |
| `trustex_identities` (`proof_of_life_email`) | 5 | **5** |
| `trinity_system_config` (`deployer_wallet`) | 1 | 1 (a public address) |

**No API key, secret or token is exposed through the anon path.** The entire
confidentiality loss is **5 email addresses** in `trustex_identities`. That is real
and should be closed, but it is not the emergency; the 324k deletable rows are.

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
— the one at the top of this section — takes seconds and would have said 193 at any
point in the last several months.

And then the count itself was got wrong twice over, which is the sharper lesson: the
first corrected query was still pointed at a sample — policies naming `anon` — and
missed the `PUBLIC` grants that dominate the real answer. **Counting is not the same
as counting the right set.** The check that caught it was cheap and should be the
default: assert the parts sum to the whole (`15 + 178 + 52 + … = 621`), because a
census that does not reconcile against the population is another sample wearing a
census's clothes.

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

### The caveat, paid — full history scan of `trinity-ecosystem` [VERIFIED]

Done 2026-08-14 after `--root` was fixed (see below). This clone is **not** shallow
(`is-shallow-repository = false`, 577 commits reachable), so the scan is complete
for this repository. The other eight remain history-unscanned.

**Working tree: 0 usable. History: 7 usable.** Five are benign, and the two that
are not were missed by every prior scan:

| hit | commit | verdict |
|---|---|---|
| `jwt:service_role` ×2, exp 2035 | `504bba66`, `5a6f93cf` | settled-inert — key disabled, no action |
| `evm:secret-key-placeholder` `0x0000…`, `0xabcd…` | `fdefbd8c`, `3a22570c` | placeholders |
| `opaque:sb_secret` | `afbb28c0` | **false positive** — matches documentation prose about the `sb_secret_…` key *format*, not a value. The pattern reads the format string as the thing it describes |
| **`evm:secret-key`** `0xdf6b…` | `3a22570c` | **REAL** — `DEPLOYER_KEY`, hardcoded in `scripts/register-agents-erc8004.js` |
| **`solana:secret-key`** | `e5b0d884` | **REAL** — `AGENT_SOPHIA_PRIVKEY`, captured into `audit_output.txt` from a local `.env.local` |

Both real keys are absent from the working tree and permanent in history. Derived
addresses, and what is actually at risk [VERIFIED via public RPC through `pg_net`]:

```
EVM  0xdf6b8215D193b11B4903d223729c3CF7A6de271d   mainnet 0 wei, Base 0 wei, nonce 0
SOL  43TSvktkyt3Fjb1C7eAkzW94GoFpD3Gi3ukGZhNA8FND  mainnet 0 lamports
```

**The EVM address is not incidental: it is exactly `trinity_system_config.
deployer_wallet`** — the fleet's live deployer identity, whose private key is
readable by anyone with history access. Two facts bound this: the repository is
**private** (`visibility: private`, 0 forks) and the key has **nonce 0**, so it has
never sent a mainnet transaction. Rotate it, but it is not an emergency.

Scope of that reassurance, stated rather than implied: `eth_getBalance` was checked
on **Ethereum mainnet, Base and Solana mainnet only**. Testnets — where the ERC-8004
registrations most plausibly live — other L2s, and **all ERC-20/NFT holdings** are
**NOT CHECKED**; a zero native balance is not a zero portfolio.

---

## 4. Repository health

| Repo | Last commit | Files | CI | Tests | Verdict |
|---|---|---:|---:|---:|---|
| `repid-engine` | 2026-08-14 | 1,776 | **6** | ~450 | **Healthy** — the reference standard |
| `trinity-ecosystem` | 2026-08-14 | — | **2** | 400+ assertions + E2E | **Healthy** |
| `trustshell` | 2026-08-08 | 130 | 1 | 6 | Active, thin CI |
| `hyperdag-protocol` | 2026-08-06 | 95 | 1 | 10 | Active |
| `HyperDAG-core` | 2026-08-10 | 27 | **0** | 3 | Active, **no CI** |
| `hyperdag-landing` | 2026-07-24 | 5 | **0** | 0 | **Deployed and current** — serves hyperdag.org via `hyperdag-trust` at `fbf8253` = HEAD. (An earlier "Not deployed" verdict here was retracted, §1.) |
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
4. ~~**Rebuild hyperdag.org from source.**~~ **WITHDRAWN** — the premise was wrong;
   see the retraction in §1. hyperdag.org is served by `hyperdag-trust`, whose
   production deploy is READY at `fbf8253` (= `main` HEAD) and whose live bytes are
   md5-identical to the committed `index.html`. Nothing needs rebuilding.
   What *is* worth doing, and is a much smaller job: **delete or clearly label the
   unused `hyperdag-org` project.** It serves no domain, its latest production
   deploy is `state: ERROR`, and its name matches the live domain closely enough
   that it cost this assessment a false headline finding. A decoy project named
   after a domain it does not serve is a trap for the next reader too.
5. **Add `/api/version` to the other six surfaces.** It is ~15 lines, it already
   exists in this repo to copy, and it is the only reason the AITrinitySymphony
   deploy state is knowable while HyperDAG's is not. Interim, free, and available
   today on every Vercel-served surface: compare the `data-dpl-id` in the served
   HTML against the project's `latestDeployment.id` (see TrustChat in §1). It
   names a deployment, not a commit, so it is a stopgap and not a substitute.
6. **Fix `www.trustmarket.dev`** — add the hostname so a certificate issues.
7. **Start retaining the TrustChat / AISocialMirror rating signal** — one table,
   raw scale, rater identity, agent-vs-model distinguished, consumed by nothing.
   This is above the mapping question and above ingestion in priority for one
   reason: unrecorded ratings are unrecoverable, while an imperfect mapping can be
   recomputed from retained rows. Do **not** wire ratings into `ReputationLedger`
   as part of this step — see §1a for why that is a privileged write and not
   plumbing.
8. **Re-check the AISocialMirror deploy gap** — production deploy 2026-03-29,
   repo pushed 2026-04-18. Establish whether undeployed commits exist on the
   default branch; the dates alone do not say (§1).
9. **Correct `LESSONS` S1** from "two tables" to 193 readable / 60 writable / 15
   RLS-off, with the query that says so.

## 6. Verification record

| Claim | Status | How |
|---|---|---|
| AITrinitySymphony on Vercel+Railway both at `3ddca6b` = main | **VERIFIED** | `/api/version` on 3 hostnames via `pg_net`, vs `git log origin/main` |
| repid-engine live at `c207e8c`, Supabase+HashKey connected | **VERIFIED** | `GET /health` via `pg_net` |
| TrustMedical.dev is a parked domain, no repo, no Vercel project | **VERIFIED 2026-08-14**, retained but **out of scope** | https fails both hosts; http 200 returns registrar page with `/parked`; GitHub search 0 results; 18 Vercel projects listed. Kept so the check is not repeated; removed from §1 because listing a parked domain as a product implies a product |
| trustchat.dev + www 200 from Vercel, "TrustChat — Real-time Hallucination Detection" | **VERIFIED 2026-08-15** | `pg_net` ×3 (apex, www, http); apex 302 → www; 19,494 bytes both |
| trustchat.dev served by `v0-trustchat`, live page = latest production deploy | **VERIFIED 2026-08-15** | project `domains` array contains apex + www; served `data-dpl-id` == `latestDeployment.id` == `dpl_6Yov5QatkQUCc8HM5DABYPJt5FEd`, READY, 2026-08-10 |
| aisocialmirror.com + www 200 from Vercel, "AISocialMirror – AI Reveals Your Hidden IQ, EQ & SQ" | **VERIFIED 2026-08-15** | `pg_net` ×3; apex 302 → www; 29,011 bytes both |
| aisocialmirror.com served by `v0-ais-ocial-mirror-landing-page`; newest prod deploy 2026-03-29, repo pushed 2026-04-18 | **VERIFIED 2026-08-15** | project `domains` array; `latestDeployment` READY at 1774807136816; repo `pushed_at` 2026-04-18T03:01:43Z |
| whether AISocialMirror has undeployed commits on its default branch | **NOT CHECKED** | `pushed_at` moves for any branch; the date gap is not evidence of undeployed default-branch work |
| `/api/version` 404s on both new surfaces | **VERIFIED 2026-08-15** | `pg_net` GET on each; both return the Next.js 404 page |
| no external-rating / feedback ingestion exists anywhere in `lib/` or `app/` | **VERIFIED 2026-08-15** | grep for `human_rating`, `user_rating`, `external_signal`, `feedback_ingest`, `rate_agent`, `thumbs` — 0 files |
| ~~hyperdag.org bytes match no commit~~ | **RETRACTED** | compared a character count to a byte count; live and repo `index.html` are md5-identical (`ff2ef682…`) |
| ~~hyperdag.org newest prod deploy is ERROR, built from `repid-engine`~~ | **RETRACTED** | true of project `hyperdag-org`, which serves **no custom domain**; the serving project is `hyperdag-trust` |
| hyperdag.org is served by `hyperdag-trust`, prod deploy READY at `fbf8253` = main HEAD | **VERIFIED** | Vercel `get_project` domains + `list_deployments`, re-probed 2026-08-14 |
| live hyperdag.org content is byte-identical to the committed `index.html` | **VERIFIED** | md5 both sides — `ff2ef682522185a58e942b1dbd84c6d3` |
| www.trustmarket.dev fails TLS | **VERIFIED** | 2 probes (https + http upgrade), both SSL errors |
| 193 anon-readable / 60 anon-writable / 15 RLS-off, of 621 tables | **VERIFIED** | `pg_policy` + `pg_class` + `has_table_privilege`, `PUBLIC` roles included, `USING` clause required literal `true`; parts reconcile to 621 |
| ~324k rows in anon-writable tables (`trinity_artifacts` 155,428, `trinity_agent_logs` 139,659) | **VERIFIED** | `pg_class.reltuples` joined to the writable set |
| no API key/secret/token exposed via anon read | **VERIFIED** | direct `count(*)` of populated secret columns; all 0 except 5 emails |
| ~~137 anon-readable / 4 anon-writable~~ | **RETRACTED** | measurement omitted `PUBLIC`-role policies; superseded by the row above |
| anon can READ `agent_preflight_control` over PostgREST | **VERIFIED** | live 200 using a publishable key, via `pg_net` |
| anon can WRITE those tables | **VERIFIED (privilege level)** | RLS off + `has_table_privilege` I/U/D true; **write deliberately not exercised** |
| **`agent_preflight_control` anon write is CLOSED** | **VERIFIED (live, 2026-08-14)** | RLS enabled + SELECT-only policy. Same publishable key: read **200**, insert **401 / 42501**, row count unchanged. The write path was finally exercised — against the fix, where rejection is the pass condition |
| The other 59 anon-writable tables | **STILL OPEN** | held for a soak period, not swept in one change |
| `scan-secrets.mjs` ignores `--root` | **VERIFIED** | source reads only `--history`; output cited a file absent from the target repos |
| No new credential leak in 8 repos | **VERIFIED (working tree)** | re-scanned per repo; every usable hit triaged by hand |
| trinity-ecosystem gate green | **VERIFIED** | tsc / check / test:e2e / build all exit 0 |
| Credentials in `trinity-ecosystem` **history** | **VERIFIED** | full `--history` scan, 577 commits, clone confirmed not shallow; 7 usable, 2 real |
| `0xdf6b…271d` is the live `deployer_wallet` and its key is in history | **VERIFIED** | derived from the committed key; equals `trinity_system_config.deployer_wallet` |
| Both leaked keypairs hold 0 native balance, deployer nonce 0 | **VERIFIED** | public RPC via `pg_net` — ETH mainnet, Base, Solana mainnet |
| Token/NFT holdings and testnet activity for those addresses | **NOT CHECKED** | only native balance queried, on 3 chains |
| Credentials in the **other 8 repos'** history | **NOT CHECKED** | `--depth 50` clones; `--history` not run there |
| `trustmarket` repo contents | **NOT CHECKED** | private; `add_repo` needs approval |
| Which commit TrustShell/repid/trustrails serve | **NOT CHECKED** | no version endpoint exists on those surfaces |
| Railway internals beyond `/health` | **NOT CHECKED** | host proxy-denied to this container |
