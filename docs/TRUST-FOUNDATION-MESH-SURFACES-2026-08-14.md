# Software Trust Foundation — mesh and surfaces, measured

**2026-08-14.** Companion to the *enforced* half. The harness is governed by
`scripts/check-trust-foundation.mjs` (`npm run check:trust`), which fails the
build on eight controls. This document covers what that script cannot reach: the
**mesh** (Supabase, the dispatch harness, the agent lanes) and the **surfaces**
(six products, ten repositories).

## What this is, and the one thing it refuses to be

This is a **measurement**, not a posture statement. Every cell is either a figure
taken on a stated date by a stated method, or the words **NOT MEASURED**. There
is no third kind of entry, and in particular there are no cells describing
controls that ought to exist.

That restraint is the entire point. A document asserting unmeasured controls is
this codebase's signature defect — *a system reporting success it has not
earned* — and a security framework is the most inviting place in the world to
commit it. Two figures in the companion assessment had to be retracted the day
they were published, both for versions of the same error. So the empty cells
below are load-bearing: **an honest gap is worth more than a confident guess**,
and the difference between "we did not look" and "it passed" is the whole
subject.

Scores are deliberately coarse — the evidence column carries the weight.

| | meaning |
|---|---|
| **ENFORCED** | a mechanism fails the build or the request; verified by execution |
| **MEASURED** | the state is known and current; nothing prevents regression |
| **PARTIAL** | some of the surface is covered; the uncovered part is named |
| **OPEN** | a known gap with an owner |
| **NOT MEASURED** | not looked at; not inferred |

---

## 1. AI Development Security

**PARTIAL.**

| evidence | measured |
|---|---|
| `scan-secrets.mjs` silently scanned the wrong repository — `--root` was parsed by nothing, so eight cross-repo scans all read the same tree | 2026-08-14, fixed and mutation-tested |
| Full history scan of `trinity-ecosystem` — 577 commits, clone confirmed not shallow | **0 usable in working tree, 7 in history** |
| Of those 7: two settled-inert `service_role` JWTs, two all-zero placeholders, one **false positive** (the pattern read documentation prose about the `sb_secret_…` *format* as a value) | triaged individually |
| **2 real keypairs in history** — an EVM `DEPLOYER_KEY` and a Solana `AGENT_SOPHIA_PRIVKEY` | see §8 |
| Cross-repo working-tree scan, six repos, each verifiably the correct target | **no real credential in any working tree** |
| `repid` lockfile had drifted from `package.json`; invisible because nothing ever ran `npm ci` | found by CI's first run |
| `trustshell` reports **11 npm vulnerabilities (8 high)** — and it is published to npm as `@hyperdag/trustshell`, so these reach consumers | 2026-08-14, **OPEN** |

**Gaps.** Git **history of the other eight repositories** is **NOT MEASURED** —
the fixed scanner makes it a single command per repo, but shallow clones here
mean it has to be run where full history exists. No dependency-provenance or
SBOM mechanism exists anywhere in the fleet: **NOT MEASURED**.

---

## 2. AI Runtime Security

**PARTIAL.**

| evidence | measured |
|---|---|
| Module-scope Supabase clients — the client is constructed at **build** time because `next build` imports every route module | **ENFORCED** in `trinity-ecosystem` (TF-01, mutation-tested) |
| `trustrails-dev` — module-scope `createClient()` in **6+ routes**; production build fails with `Error: supabaseUrl is required` at *Collecting page data* | 2026-08-14, **OPEN** |
| The same commit deployed to two Vercel projects: `trustrails` **Ready**, `trustrails-dev` **Error** — identical source, so the difference is environment | build logs, 2026-08-14 |
| `institution_config` write allowlist — every column was once writable by anyone who could reach `POST /api/trustrails/settings` with the service key | `check:auth`, 28 assertions |

**Gaps.** Rate limiting, WAF, bot protection and abuse controls on any public
surface: **NOT MEASURED**. Runtime egress restrictions for agent processes:
**NOT MEASURED**. Note the dispatcher's child process inherits the full
`process.env` while its scrubber covers only the resolved key — recorded as a
known follow-up on `repid-engine` #429, **OPEN**.

---

## 3. AI Agent Security

**PARTIAL — and this is the domain with the most active work.**

| evidence | measured |
|---|---|
| The fabrication detector could be **switched off from the command line**: one `--evidence "git log --oneline -1"` disarmed it for every claim in a transcript | `repid-engine` #429 |
| An invented `exit 0` **self-grounds** against the harness's own `[exit N]` wrapper — detector does not fire at all, grade stays `[V]` | proven by execution, 2026-08-14 |
| `maxGrade` and `unsupported` encoded the same judgment twice; only one was fixed | fix on `review/dispatch-429-maxgrade-exit` |
| Lane write scope — **XC = L6 RED-TEAM, GA = L7 MEASUREMENT, both "no write scope"**; CC is the only writer | `lane-registry.ts` |
| `agent_preflight_control` — the `global_pause` switch every agent must obey — was **anonymously writable** with a browser-shipped key | **CLOSED 2026-08-14**, verified live |
| `antigravity_prompt_queue` is anon-writable: an unauthenticated prompt-injection channel into an agent loop. It holds 0 rows | **OPEN** |
| Agent handoff inboxes are hardcoded to `E:/dev/handoffs/` — one machine, no env override | **OPEN** |

**Gaps.** No mechanism prevents a *new* lane from being granted `shell` by
mistake, which is the one condition that makes the fabrication detector go dark
— named on #429 as a lane-registry problem, **NOT MEASURED**.

---

## 4. AI Knowledge Security

**OPEN — the largest measured gap in the fleet.**

| evidence | measured |
|---|---|
| Effective anonymous access across 621 tables | **193 readable, 60 writable, 15 RLS-off** |
| Rows sitting in anon-**writable** tables — `trinity_artifacts` 155,428, `trinity_agent_logs` 139,659 | **~324,000 anonymously deletable** |
| Confidentiality exposure, measured directly rather than inferred from table counts | **no API key, secret or token is anon-readable** |
| Entire confidentiality loss | **5 email addresses** in `trustex_identities` |
| Publishable keys map to `anon` and ship in the browser bundle — public by design, 5 live | verified |

**Status.** One table closed (§3). **59 remain**, held deliberately for a soak
period rather than swept in one change so that a regression has one obvious
cause. `trinity_agent_logs` and `trinity_artifacts` are the priority: they are
the fleet's working memory, and they are the tables a Supabase-based agent
handoff bus would sit beside.

**The shape of the original error is worth keeping.** The first census
undercounted the writable set by roughly fifteenfold and the readable set by
about a third. Its figures are retracted and are deliberately not restated here —
a superseded number reprinted in a new document is how a retraction leaks back
into circulation. What it did wrong: it counted only policies naming `anon`,
dropping every `PUBLIC`-role policy, then scored a policy as open on the strength
of its role without checking whether its `USING` clause was literally `true`.

The check that would have caught it costs nothing: **assert the parts sum to the
whole.** A census that does not reconcile against its population is a sample
wearing a census's clothes. `15 + 178 + 52 + …` had to equal 621, and nothing
had ever asked it to.

---

## 5. AI Governance

**ENFORCED — the strongest domain, and the only one with a working immune
response.**

| evidence | measured |
|---|---|
| `check:prior-work` — retracted figures cannot reappear in a new file; every doc must be reachable from the index | **8 retracted claims enforced**, in CI |
| `check:trust` — eight controls, three outcomes, **all mutation-tested** | 2026-08-14 |
| Retractions issued **the same day as publication**, by the discipline rather than by a later reader | 2 today |
| The guard caught the **first draft of a retraction** citing the claim it was retracting | reworded rather than allowlisted, so the file stays enforced |

That last row is the one worth dwelling on. The mechanism did not merely record a
correction — it **blocked its author from writing a sloppy one**. That is the
difference between governance that is enforced and governance that is described,
and it is the argument for extending this pattern rather than writing more prose.

**Gaps.** These mechanisms exist in `trinity-ecosystem` only. Nothing equivalent
runs in the other nine repositories: **OPEN**.

---

## 6. AI Observability

**PARTIAL.**

| surface | can it report its own commit? |
|---|---|
| `aitrinitysymphony.com` | **yes** — `/api/version`, and it proved both Vercel *and* Railway at `681df44` = `main` HEAD |
| `repid-engine` | **yes** — `/health` returns `deployed_commit`, plus `supabaseConnected` / `hashkeyConnected` |
| `trustshell.dev` | in PR #59, not merged |
| `hyperdag.org` | in PR #5, not merged |
| `trustmarket.dev` | **no** |
| `trustmedical.dev` | n/a — parked domain, no repo, no project |

**What the absence cost, precisely.** Two successive **wrong** conclusions about
what `hyperdag.org` was running. The first was published as a headline finding;
the second reached the truth only after cross-referencing project metadata,
deployment lists and content hashes across two APIs. A single self-reported field
would have settled it in one request. The failure mode was inference from
outside; the fix is self-report.

**Gaps.** Centralised log aggregation, metrics, alerting and tracing across the
fleet: **NOT MEASURED**. No mechanism alerts on a surface serving a stale commit
— the endpoints make it *checkable*, not *checked*.

---

## 7. AIOps and Remediation

**PARTIAL.**

| repository | gating CI |
|---|---|
| `repid-engine` | 6 workflows |
| `trinity-ecosystem` | 2, now including `check:trust` |
| `trustshell` | **had a workflow that had never run on a PR** — tags and manual dispatch only. Gate added in #59 |
| `repid` | added, **green** (#1) |
| `hyperdag-landing` | added, **green** (#5) |
| `trustrails-dev` | **baseline recorder**, report-only (#1) |
| `hyperdag-protocol` | 1 workflow, trigger **NOT MEASURED** |
| `HyperDAG-core` | none — Rust, and unmeasurable from here (`static.crates.io` proxy-denied) |
| `aitrinitysymphony-landing` | none |
| `trustmarket` | **NOT MEASURED** — private, access not granted |

**The distinction that matters, and it was earned.** An audit counting workflow
*files* scored `trustshell` as having CI. An audit counting *gating checks*
scored it as having none. The second is the true one.

**`trustrails-dev` is deliberately report-only.** It carries 119 `tsc` errors and
a failing build. A blocking gate there would be red on day one, and a
permanently-red gate is not a gate — people learn to merge past it, and the repo
then *looks* checked. `continue-on-error` was rejected for the opposite reason: a
failed step allowed to pass renders as a **green tick**. The recorder reports
three outcomes and exits 0 on purpose.

**Gaps.** No automated remediation anywhere: every fix in this fleet is
human-or-agent initiated. Dependency update automation: **NOT MEASURED**.

---

## 8. Identity & Trust

**PARTIAL.**

| evidence | measured |
|---|---|
| Legacy `anon` and `service_role` JWTs | **`disabled: true`**, verified via the Supabase API |
| The publicly-leaked legacy `service_role` JWT | **inert** — settled, do not re-open |
| Live publishable keys | 5 |
| Leaked EVM `DEPLOYER_KEY` in history → `0xdf6b8215D193b11B4903d223729c3CF7A6de271d` | **equals `trinity_system_config.deployer_wallet`** — the fleet's live deployer |
| That address: ETH mainnet, Base, and nonce | **0 wei, 0 wei, nonce 0** — never used on mainnet |
| Leaked Solana `AGENT_SOPHIA_PRIVKEY` → `43TSvktkyt3Fjb1C7eAkzW94GoFpD3Gi3ukGZhNA8FND` | **0 lamports** |
| Repository visibility | **private**, 0 forks |

**Correct reading of the severity.** The asset at risk is **identity control, not
funds** — the EVM key owns 3 live ERC-8004 identities. Rotate it; it is not an
emergency. The bounding facts are measured, and so is the scope of the
reassurance: **native balance only, on three chains.** Testnets — where the
ERC-8004 registrations most plausibly live — other L2s, and **all ERC-20/NFT
holdings** are **NOT MEASURED**. A zero native balance is not a zero portfolio.

---

## Where this is weakest

Stated plainly, because a maturity assessment that reads as uniformly reassuring
is not measuring hard enough:

1. **59 anon-writable tables** holding the fleet's working memory. Everything
   else here is smaller than this.
2. **Governance mechanisms exist in one repository of ten.** The strongest domain
   is also the least evenly distributed.
3. **Nothing is watched.** Observability is now *checkable* on two surfaces and
   *checked* on none — no alerting, no aggregation, no stale-deploy detection.
4. **Antifragility is unevidenced.** The fleet has demonstrated it can *detect*
   and *correct* — twice today, quickly. It has not demonstrated that it
   *degrades gracefully*, because no failure injection has ever been run. That is
   the honest ceiling on any claim of resilience here, and it is **NOT MEASURED**
   rather than absent.

## What would raise each domain, cheapest first

1. Close the 59 tables — one migration per batch, `trinity_agent_logs` and
   `trinity_artifacts` first. Lifts §4 from OPEN toward ENFORCED.
2. Copy `check:trust` into the other nine repositories. Lifts §5 fleet-wide; the
   script is ~300 lines and repo-agnostic where a control does not apply, since
   it reports NOT ENFORCEABLE rather than passing.
3. Merge the two open `/api/version` PRs, then add a scheduled probe comparing
   each surface's reported commit against its repo HEAD. Turns §6 from checkable
   into checked — and it is the single cheapest control in this document.
4. Run `scan-secrets --history` against the other eight repositories.
5. Rotate the two keypairs in §8.
6. Fix the module-scope clients in `trustrails-dev`, then promote its baseline
   recorder to a gate.
